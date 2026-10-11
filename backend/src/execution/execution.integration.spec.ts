import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { JsonLogger } from '../common/json.logger';
import { ALL_ENTITIES } from '../database/entities';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import { ExecutionControl } from '../database/entities/execution-control.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { ExecutionControlService } from './execution-control.service';
import { ExecutionMode, GateKey } from './execution.types';
import { GatePolicyService } from './gate-policy.service';
import { LedgerService } from './ledger.service';
import { ReservationResult, RiskEngineService } from './risk-engine.service';
import { ExecutionGateEvidence } from '../database/entities/execution-gate-evidence.entity';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { BetOrder } from '../database/entities/bet-order.entity';
import { BetReceipt } from '../database/entities/bet-receipt.entity';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { DeterministicSandboxAdapter } from './adapters/deterministic-sandbox.adapter';
import { OrderExecutionService } from './order-execution.service';
import { OperatorPort } from './operator.port';
import { ReconciliationService } from './reconciliation.service';
import {
  RECONCILIATION_LOCK,
  ReconciliationScheduler,
} from './reconciliation.scheduler';
import { SchedulerRegistry } from '@nestjs/schedule';

declare const JEST_INTEGRATION_RUN: boolean | undefined;

/**
 * Intégration MySQL réelle des lots 6 et 7. Lancée par `npm run test:integration` (qui ÉCHOUE si la
 * base n'est pas configurée) ; ignorée par `npm test`.
 */
const integrationRun =
  typeof JEST_INTEGRATION_RUN !== 'undefined' && JEST_INTEGRATION_RUN;
const describeIntegration = integrationRun ? describe : describe.skip;
const databaseUrl = process.env.EXECUTION_MYSQL_INTEGRATION_DB_URL;
const destructiveOptIn = 'api-score-execution-it';
const ephemeralDatabaseName = 'api_score_execution_it';
const ADMIN = '00000000-0000-4000-8000-00000000000a';

describeIntegration(
  'Lots 6-7 — contrôle, risque, ledger et ordres sur MySQL',
  () => {
    let dataSource: DataSource;
    const env: Record<string, string | undefined> = {
      REAL_MONEY_INTERLOCK: 'false',
    };
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as JsonLogger;
    let control: ExecutionControlService;
    let gates: GatePolicyService;
    let ledger: LedgerService;
    let risk: RiskEngineService;
    let accountSeq = 0;

    function build(ds: DataSource) {
      const gatePolicy = new GatePolicyService(
        ds.getRepository(ExecutionGateEvidence),
      );
      const ctl = new ExecutionControlService(
        ds,
        gatePolicy,
        { get: (key: string) => env[key] } as unknown as ConfigService,
        new AsyncContextService(),
        logger,
      );
      const ldg = new LedgerService(ds);
      return {
        gatePolicy,
        ctl,
        ldg,
        rsk: new RiskEngineService(ds, ctl, ldg, logger),
      };
    }

    const readControlRow = () =>
      dataSource
        .getRepository(ExecutionControl)
        .findOneByOrFail({ scope: 'GLOBAL' });

    async function evidence(gate: GateKey): Promise<string> {
      const row = await readControlRow();
      const saved = await gates.record(
        {
          controlId: row.id,
          gateKey: gate,
          periodFrom: new Date('2026-09-01T00:00:00Z'),
          periodTo: new Date('2026-10-01T00:00:00Z'),
          metrics: { gate },
          reportHash: createHash('sha256')
            .update(`${gate}:${randomUUID()}`)
            .digest('hex'),
          verdict: 'GO',
        },
        ADMIN,
      );
      return saved.id;
    }

    /** Remet le contrôle à l'arrêt, active une politique, puis monte jusqu'au mode voulu. */
    async function arm(
      target: ExecutionMode,
      limits: Partial<{
        stake: string;
        daily: string;
        loss: string;
        exposure: string;
      }> = {},
    ): Promise<void> {
      await control.stop('reset de test', ADMIN);
      const before = await readControlRow();
      await control.createRiskPolicy(
        {
          currency: 'EUR',
          maxStakePerBet: limits.stake ?? '10.00',
          maxDailyStake: limits.daily ?? '1000.00',
          maxDailyLoss: limits.loss ?? '500.00',
          maxOpenExposure: limits.exposure ?? '1000.00',
          maxQuoteAgeMs: 60_000,
          activate: true,
          expectedVersion: before.version,
        },
        ADMIN,
      );
      const steps: Array<[ExecutionMode, GateKey[]]> = [
        ['SIMULATION', ['G1', 'G2']],
        ['SANDBOX', ['G3']],
        ['LIVE_CANARY', ['G4', 'G5', 'G6']],
      ];
      for (const [mode, required] of steps) {
        const ids = await Promise.all(required.map((gate) => evidence(gate)));
        const row = await readControlRow();
        await control.changeMode(
          {
            targetMode: mode,
            reason: `montée ${mode}`,
            expectedVersion: row.version,
            gateEvidenceIds: ids,
          },
          ADMIN,
        );
        if (mode === target) return;
      }
    }

    async function account(
      mode: ExecutionMode,
      balance = '1000.00',
    ): Promise<BankrollAccount> {
      accountSeq += 1;
      return ledger.openAccount(
        {
          mode,
          operatorKey: `op-${accountSeq}`,
          currency: 'EUR',
          initialBalance: balance,
        },
        ADMIN,
      );
    }

    const reserve = (
      accountId: string,
      key: string,
      stake = '10.00',
    ): Promise<ReservationResult> =>
      risk.reserveStake({
        accountId,
        entryKey: key,
        stake,
        quoteCapturedAt: new Date(),
      });

    const entriesOf = (accountId: string) =>
      dataSource
        .getRepository(BankrollLedgerEntry)
        .find({ where: { accountId } });

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error(
          'EXECUTION_MYSQL_INTEGRATION_DB_URL absent : les tests d’intégration des lots 6-7 ne peuvent pas être ignorés',
        );
      }
      if (
        process.env.EXECUTION_MYSQL_INTEGRATION_DESTRUCTIVE !== destructiveOptIn
      ) {
        throw new Error(
          `Refus d'opération destructive sans EXECUTION_MYSQL_INTEGRATION_DESTRUCTIVE=${destructiveOptIn}`,
        );
      }
      const admin = new DataSource({ type: 'mysql', url: databaseUrl });
      await admin.initialize();
      const [{ name }] = (await admin.query(
        'SELECT DATABASE() AS name',
      )) as Array<{ name: string }>;
      if (name !== ephemeralDatabaseName) {
        await admin.destroy();
        throw new Error(
          `Refus d'opération destructive hors de ${ephemeralDatabaseName}`,
        );
      }
      await admin.query(`DROP DATABASE ${ephemeralDatabaseName}`);
      await admin.query(`CREATE DATABASE ${ephemeralDatabaseName}`);
      await admin.destroy();

      dataSource = new DataSource({
        type: 'mysql',
        url: databaseUrl,
        entities: ALL_ENTITIES,
        migrations: [join(__dirname, '../database/migrations/*.ts')],
        synchronize: false,
        logging: false,
        extra: { connectionLimit: 30 },
      });
      await dataSource.initialize();
      await dataSource.runMigrations();
      await dataSource.query(
        `INSERT INTO auth_users (id, email, password_hash, role) VALUES (?, 'admin@it.local', 'x', 'ADMIN')`,
        [ADMIN],
      );
      const built = build(dataSource);
      control = built.ctl;
      gates = built.gatePolicy;
      ledger = built.ldg;
      risk = built.rsk;
    });

    afterAll(async () => {
      await dataSource?.destroy();
    });

    beforeEach(() => {
      env.REAL_MONEY_INTERLOCK = 'false';
    });

    it('après migration, le contrôle est DISABLED et refuse toute réservation', async () => {
      const row = await readControlRow();
      expect(row).toMatchObject({
        mode: 'DISABLED',
        version: 1,
        stopSource: 'BOOTSTRAP',
      });
      const acc = await account('SIMULATION');

      await expect(reserve(acc.id, 'boot-1')).resolves.toMatchObject({
        status: 'REJECTED',
        code: 'CONTROL_DISABLED',
      });
      expect(await entriesOf(acc.id)).toHaveLength(1); // seule l'écriture d'ouverture
    });

    it('monter exige politique active et gates ; transition non adjacente refusée', async () => {
      await control.stop('reset', ADMIN);
      const row = await readControlRow();
      await expect(
        control.changeMode(
          {
            targetMode: 'SANDBOX',
            reason: 'saut',
            expectedVersion: row.version,
            gateEvidenceIds: [],
          },
          ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);

      await arm('SIMULATION');
      const armed = await readControlRow();
      await expect(
        control.changeMode(
          {
            targetMode: 'SANDBOX',
            reason: 'sans preuve',
            expectedVersion: armed.version,
            gateEvidenceIds: [],
          },
          ADMIN,
        ),
      ).rejects.toThrow('preuves de gate insuffisantes');
    });

    it('changement de mode concurrent : une seule transition gagne, l’autre est en conflit de version', async () => {
      await arm('SIMULATION');
      const g3 = await evidence('G3');
      const row = await readControlRow();
      const attempts = await Promise.allSettled(
        ['a', 'b', 'c'].map((reason) =>
          control.changeMode(
            {
              targetMode: 'SANDBOX',
              reason,
              expectedVersion: row.version,
              gateEvidenceIds: [g3],
            },
            ADMIN,
          ),
        ),
      );

      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      const losers = attempts.filter(
        (a) => a.status === 'rejected',
      ) as PromiseRejectedResult[];
      expect(losers).toHaveLength(2);
      expect(losers.every((a) => a.reason instanceof ConflictException)).toBe(
        true,
      );
      expect(await readControlRow()).toMatchObject({
        mode: 'SANDBOX',
        version: row.version + 1,
      });
    });

    it('20 réservations concurrentes sur le dernier budget : exactement ce qui reste, jamais plus', async () => {
      await arm('SIMULATION', { stake: '10.00', daily: '100.00' });
      const acc = await account('SIMULATION');
      for (let i = 0; i < 5; i += 1) {
        await expect(reserve(acc.id, `prev-${i}`)).resolves.toMatchObject({
          status: 'RESERVED',
        });
      }

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => reserve(acc.id, `last-${i}`)),
      );
      const reserved = results.filter((r) => r.status === 'RESERVED');
      const rejected = results.filter((r) => r.status === 'REJECTED');

      expect(reserved).toHaveLength(5);
      expect(rejected).toHaveLength(15);
      expect(
        rejected.every(
          (r) =>
            r.status === 'REJECTED' &&
            ['LIMIT_EXCEEDED', 'CONTROL_DISABLED'].includes(r.code),
        ),
      ).toBe(true);
      const fresh = await dataSource
        .getRepository(BankrollAccount)
        .findOneByOrFail({ id: acc.id });
      expect(fresh).toMatchObject({
        availableBalance: '900.00',
        reservedBalance: '100.00',
      });
      expect((await ledger.verifyInvariant(acc.id)).ok).toBe(true);
      // Budget du jour épuisé : l'exécution s'est arrêtée d'elle-même, réactivation manuelle requise.
      const row = await readControlRow();
      expect(row).toMatchObject({ mode: 'DISABLED', stopSource: 'AUTOMATIC' });
      expect(row.stopReason).toContain('DAILY_LIMIT_REACHED');
    });

    it('double écriture même clé : une seule écriture ; même clé autre montant : refus sans arrêt', async () => {
      await arm('SIMULATION');
      const acc = await account('SIMULATION');
      const [a, b] = await Promise.all([
        reserve(acc.id, 'dup'),
        reserve(acc.id, 'dup'),
      ]);

      expect([a.status, b.status]).toEqual(['RESERVED', 'RESERVED']);
      expect(
        [a, b].filter((r) => r.status === 'RESERVED' && r.replayed),
      ).toHaveLength(1);
      expect(
        (await entriesOf(acc.id)).filter((e) => e.entryKey === 'dup'),
      ).toHaveLength(1);

      await expect(reserve(acc.id, 'dup', '7.00')).resolves.toMatchObject({
        status: 'REJECTED',
        code: 'RISK_CHECK_FAILED',
      });
      expect((await readControlRow()).mode).toBe('SIMULATION');
      expect(
        (
          await dataSource
            .getRepository(BankrollAccount)
            .findOneByOrFail({ id: acc.id })
        ).reservedBalance,
      ).toBe('10.00');
    });

    it('écriture forgée sur une version déjà utilisée : refusée par la base ; ledger altéré : arrêt automatique', async () => {
      await arm('SIMULATION');
      const acc = await account('SIMULATION');
      await reserve(acc.id, 'v-1');
      const [last] = await dataSource.getRepository(BankrollLedgerEntry).find({
        where: { accountId: acc.id },
        order: { accountVersion: 'DESC' },
        take: 1,
      });

      await expect(
        dataSource.getRepository(BankrollLedgerEntry).insert({
          ...last,
          id: undefined,
          entryKey: 'forged',
        }),
      ).rejects.toThrow(/Duplicate entry/);

      // Corruption simulée hors application : le solde du compte ne correspond plus au journal.
      await dataSource.query(
        'UPDATE bankroll_accounts SET available_balance = available_balance + 1 WHERE id = ?',
        [acc.id],
      );
      await expect(risk.checkLedgerInvariant(acc.id)).resolves.toBe(false);
      const row = await readControlRow();
      expect(row.mode).toBe('DISABLED');
      expect(row.stopReason).toContain('LEDGER_INVARIANT_BROKEN');
    });

    it('arrêt pendant des réservations : aucune réservation écrite après l’arrêt', async () => {
      await arm('SIMULATION', { daily: '1000.00' });
      const acc = await account('SIMULATION');
      const pending = Array.from({ length: 20 }, (_, i) =>
        reserve(acc.id, `race-${i}`, '5.00'),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      const stopped = await control.stop('arrêt d’urgence', ADMIN);
      const results = await Promise.all(pending);

      const reserveEntries = (await entriesOf(acc.id)).filter(
        (e) => e.entryType === 'RESERVE',
      );
      const row = await readControlRow();
      expect(stopped.mode).toBe('DISABLED');
      expect(
        reserveEntries.every(
          (e) => e.createdAt.getTime() <= row.changedAt.getTime(),
        ),
      ).toBe(true);
      expect(results.filter((r) => r.status === 'RESERVED')).toHaveLength(
        reserveEntries.length,
      );
      await expect(
        reserve(acc.id, 'after-stop', '5.00'),
      ).resolves.toMatchObject({
        code: 'CONTROL_DISABLED',
      });
      expect((await ledger.verifyInvariant(acc.id)).ok).toBe(true);
    });

    it('relâcher et régler restent possibles exécution arrêtée ; perte du jour atteinte : arrêt', async () => {
      await arm('SIMULATION', { loss: '15.00' });
      const acc = await account('SIMULATION');
      await reserve(acc.id, 's-1');
      await reserve(acc.id, 's-2');
      await reserve(acc.id, 's-3');
      await control.stop('pause', ADMIN);

      await risk.releaseStake({
        accountId: acc.id,
        entryKey: 's-1:release',
        stake: '10.00',
      });
      await risk.settleStake({
        accountId: acc.id,
        entryKey: 's-2:settle',
        stake: '10.00',
        payout: '18.50',
      });
      expect(
        await dataSource
          .getRepository(BankrollAccount)
          .findOneByOrFail({ id: acc.id }),
      ).toMatchObject({
        availableBalance: '998.50',
        reservedBalance: '10.00',
      });

      await arm('SIMULATION', { loss: '5.00' });
      // Jour : +8.50 (s-2) ; s-3 perdu → −1.50, sous la perte maximale de 5 ; s-4 perdu → −11.50 ≥ 5 → arrêt.
      await risk.settleStake({
        accountId: acc.id,
        entryKey: 's-3:settle',
        stake: '10.00',
        payout: '0.00',
      });
      expect((await readControlRow()).mode).toBe('SIMULATION');
      await expect(reserve(acc.id, 's-4')).resolves.toMatchObject({
        status: 'RESERVED',
      });
      await risk.settleStake({
        accountId: acc.id,
        entryKey: 's-4:settle',
        stake: '10.00',
        payout: '0.00',
      });
      const row = await readControlRow();
      expect(row.mode).toBe('DISABLED');
      expect(row.stopReason).toContain('DAILY_LIMIT_REACHED');
      expect((await ledger.verifyInvariant(acc.id)).ok).toBe(true);
    });

    it('interlock fermé : LIVE_CANARY refusé malgré toutes les gates, et une réservation live est bloquée', async () => {
      await arm('SANDBOX');
      const ids = await Promise.all(
        (['G4', 'G5', 'G6'] as const).map((gate) => evidence(gate)),
      );
      let row = await readControlRow();
      await expect(
        control.changeMode(
          {
            targetMode: 'LIVE_CANARY',
            reason: 'go',
            expectedVersion: row.version,
            gateEvidenceIds: ids,
          },
          ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);

      env.REAL_MONEY_INTERLOCK = 'true';
      row = await readControlRow();
      await control.changeMode(
        {
          targetMode: 'LIVE_CANARY',
          reason: 'go',
          expectedVersion: row.version,
          gateEvidenceIds: ids,
        },
        ADMIN,
      );
      const acc = await account('LIVE_CANARY', '50.00');
      env.REAL_MONEY_INTERLOCK = 'false';
      await expect(reserve(acc.id, 'live-1', '5.00')).resolves.toMatchObject({
        status: 'REJECTED',
        code: 'CONTROL_DISABLED',
        reason: 'REAL_MONEY_INTERLOCK fermé',
      });
      expect(await entriesOf(acc.id)).toHaveLength(1);
      await control.stop('fin du test live', ADMIN);
    });

    it('contrôle absent : lecture DISABLED, réservation refusée, arrêt automatique qui recrée un contrôle arrêté', async () => {
      await arm('SIMULATION');
      const acc = await account('SIMULATION');
      await dataSource.query(
        "UPDATE execution_controls SET scope = 'ARCHIVED' WHERE scope = 'GLOBAL'",
      );

      await expect(control.readControl()).resolves.toMatchObject({
        readable: false,
        mode: 'DISABLED',
      });
      await expect(reserve(acc.id, 'absent-1')).resolves.toMatchObject({
        code: 'CONTROL_DISABLED',
      });
      const recreated = await readControlRow();
      expect(recreated).toMatchObject({
        mode: 'DISABLED',
        stopSource: 'AUTOMATIC',
      });
      expect(recreated.stopReason).toContain('CONTROL_UNREADABLE');

      await dataSource.query(
        'DELETE FROM operation_audit_events WHERE target_id = ?',
        [recreated.id],
      );
      await dataSource.query('DELETE FROM execution_controls WHERE id = ?', [
        recreated.id,
      ]);
      await dataSource.query(
        "UPDATE execution_controls SET scope = 'GLOBAL' WHERE scope = 'ARCHIVED'",
      );
    });

    it('base indisponible : contrôle lu DISABLED et réservation refusée, sans exception', async () => {
      const broken = new DataSource({
        type: 'mysql',
        url: databaseUrl,
        entities: ALL_ENTITIES,
      });
      await broken.initialize();
      const services = build(broken);
      await broken.destroy();

      await expect(services.ctl.readControl()).resolves.toMatchObject({
        readable: false,
        mode: 'DISABLED',
      });
      await expect(
        services.rsk.reserveStake({
          accountId: '00000000-0000-4000-8000-000000000001',
          entryKey: 'down',
          stake: '1.00',
          quoteCapturedAt: new Date(),
        }),
      ).resolves.toMatchObject({
        status: 'REJECTED',
        code: 'RISK_CHECK_FAILED',
      });
    });

    it('audit des transitions : atomique, expurgé, sans donnée technique', async () => {
      await arm('SIMULATION');
      await control.stop('motif\r\nsur deux lignes\u0007', ADMIN);
      const events = await dataSource.getRepository(OperationAuditEvent).find({
        where: { targetType: 'EXECUTION_CONTROL' },
      });
      const allowed = new Set([
        'from',
        'to',
        'version',
        'expectedVersion',
        'source',
        'reason',
        'gateEvidenceIds',
        'recreated',
        'riskPolicyId',
        'riskPolicyVersion',
      ]);
      expect(events.length).toBeGreaterThan(5);
      for (const event of events) {
        expect(
          Object.keys(event.metadata ?? {}).filter((key) => !allowed.has(key)),
        ).toEqual([]);
        expect(
          Object.values(event.metadata ?? {}).every(
            (v) =>
              v === null || ['string', 'number', 'boolean'].includes(typeof v),
          ),
        ).toBe(true);
      }
      const lastStop = events
        .filter((e) => e.action === 'EXECUTION_STOP')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      expect(lastStop.metadata).toMatchObject({
        reason: 'motif sur deux lignes',
        to: 'DISABLED',
      });
      expect(lastStop.actorUserId).toBe(ADMIN);
    });
    describe('Lot 7 — pipeline d’ordres, sandbox déterministe et réconciliation', () => {
      const sandbox = new DeterministicSandboxAdapter();
      let orders: OrderExecutionService;
      let reconciliation: ReconciliationService;
      let simulationRunId: string;
      let reconSeq = 0;
      const SECRETS = [
        'sandbox-session-secret',
        'punter@sandbox.test',
        '0001234567',
      ];

      beforeAll(async () => {
        orders = new OrderExecutionService(
          dataSource,
          control,
          risk,
          ledger,
          { SANDBOX: sandbox },
          logger,
        );
        reconciliation = new ReconciliationService(
          dataSource,
          orders,
          control,
          logger,
        );
        simulationRunId = randomUUID();
        await dataSource.query(
          `INSERT INTO simulation_runs (id, idempotency_key, name, strategy_version, strategy_snapshot,
           risk_snapshot, config_hash, currency, initial_bankroll, status, started_at)
         VALUES (?, ?, 'it', 'v-it', '{}', '{}', ?, 'EUR', 1000, 'RUNNING', NOW(3))`,
          [simulationRunId, 'r'.repeat(64), 'c'.repeat(64)],
        );
      });

      async function decision(
        stake = '5.00',
        odd = 2.0,
        minOdd = 1.8,
      ): Promise<string> {
        const id = randomUUID();
        const key = createHash('sha256').update(id).digest('hex');
        await dataSource.query(
          `INSERT INTO bet_decisions (id, simulation_run_id, signal_key, idempotency_key, fixture_id,
           provider_fixture_id, is_home_team, market_type, market_key, selection_key, selection,
           rule_name, min_acceptable_odd, status, decided_at, currency, stake, decision_odd,
           decision_observed_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'MATCH_WINNER', '1X2', 'HOME', 'Home', 'it', ?, 'ELIGIBLE',
           NOW(3), 'EUR', ?, ?, NOW(3))`,
          [
            id,
            simulationRunId,
            key,
            key,
            randomUUID(),
            Math.floor(Math.random() * 1e9),
            minOdd,
            stake,
            odd,
          ],
        );
        return id;
      }

      async function sandboxAccount(): Promise<BankrollAccount> {
        await arm('SANDBOX');
        sandbox.reset();
        sandbox.fund('EUR', '1000.00');
        return account('SANDBOX');
      }

      async function reconcile(accountId: string, now = new Date()) {
        reconSeq += 1;
        const { run } = await reconciliation.open(
          {
            accountId,
            from: new Date(now.getTime() - 86_400_000),
            to: new Date(now.getTime() + 60_000),
            idempotencyKey: `it:${reconSeq}:${accountId}`,
          },
          ADMIN,
        );
        await reconciliation.execute(run.id, now);
        return reconciliation.getRun(run.id);
      }

      const orderOf = (decisionId: string) =>
        dataSource.getRepository(BetOrder).findOneByOrFail({ decisionId });
      const decisionRow = (id: string) =>
        dataSource.getRepository(BetDecision).findOneByOrFail({ id });
      const accountRow = (id: string) =>
        dataSource.getRepository(BankrollAccount).findOneByOrFail({ id });
      const keysOf = async (accountId: string) =>
        (await entriesOf(accountId))
          .map((e) => e.entryKey.split(':')[0])
          .sort();
      const later = (ms: number) => new Date(Date.now() + ms);

      it('acceptation : un seul placement, reçu expurgé, rejeu sans resoumission, règlement par réconciliation', async () => {
        const acc = await sandboxAccount();
        const d = await decision();
        const order = await orders.executeDecision(d, acc.id);
        expect(order).toMatchObject({
          status: 'ACCEPTED',
          acceptedOdd: 1.9,
          acceptedStake: '5.00',
        });
        expect(sandbox.placeCallsFor(order!.idempotencyKey)).toBe(1);
        await expect(orders.executeDecision(d, acc.id)).resolves.toMatchObject({
          id: order!.id,
          status: 'ACCEPTED',
        });
        expect(sandbox.placeCallsFor(order!.idempotencyKey)).toBe(1);
        expect(await decisionRow(d)).toMatchObject({
          status: 'ORDER_RESERVED',
          executableOdd: 1.9,
        });
        expect(await accountRow(acc.id)).toMatchObject({
          availableBalance: '995.00',
          reservedBalance: '5.00',
        });

        const receipt = await dataSource
          .getRepository(BetReceipt)
          .findOneByOrFail({ orderId: order!.id });
        expect(receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);

        sandbox.settle(order!.externalOrderId!, 'WON');
        const run = await reconcile(acc.id);
        expect(run).toMatchObject({ status: 'COMPLETED', criticalCount: 0 });
        expect(await orderOf(d)).toMatchObject({
          status: 'SETTLED',
          payout: '9.50',
        });
        expect(await decisionRow(d)).toMatchObject({
          status: 'COMPLETED',
          outcome: 'WON',
          profit: '4.50',
        });
        expect(await accountRow(acc.id)).toMatchObject({
          availableBalance: '1004.50',
          reservedBalance: '0.00',
        });
        expect(run.items.find((i) => i.itemType === 'BALANCE')).toMatchObject({
          result: 'MATCH',
        });
        expect(await keysOf(acc.id)).toEqual(['open', 'reserve', 'settle']);
        expect((await ledger.verifyInvariant(acc.id)).ok).toBe(true);

        // Aucune donnée sensible : ni dans le reçu, ni dans la preuve, ni dans les journaux.
        const persisted = JSON.stringify([
          receipt.redactedPayload,
          run.items,
          run.summary,
        ]);
        const logged = JSON.stringify(
          [logger.log, logger.warn, logger.error].flatMap(
            (f) => (f as jest.Mock).mock.calls,
          ),
        );
        for (const secret of SECRETS) {
          expect(persisted).not.toContain(secret);
          expect(logged).not.toContain(secret);
        }
      });

      it('refus opérateur : ordre et décision refusés, mise relâchée', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('REJECT');
        const d = await decision();
        await expect(orders.executeDecision(d, acc.id)).resolves.toMatchObject({
          status: 'REJECTED',
          rejectionCode: 'OPERATOR_UNAVAILABLE',
        });
        expect(await decisionRow(d)).toMatchObject({ status: 'REJECTED' });
        expect(await accountRow(acc.id)).toMatchObject({
          availableBalance: '1000.00',
          reservedBalance: '0.00',
        });
        expect((await reconcile(acc.id)).criticalCount).toBe(0);
      });

      it('cote déplacée : refus opérateur ODD_MOVED, ou cote sous le minimum sans aucun appel', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('ODD_MOVED');
        const d1 = await decision();
        await expect(orders.executeDecision(d1, acc.id)).resolves.toMatchObject(
          {
            rejectionCode: 'ODD_MOVED',
          },
        );

        sandbox.setQuoteOdd(1.5);
        const d2 = await decision();
        const o2 = await orders.executeDecision(d2, acc.id);
        expect(o2).toMatchObject({
          status: 'REJECTED',
          rejectionCode: 'ODD_MOVED',
        });
        expect(sandbox.placeCallsFor(o2!.idempotencyKey)).toBe(0);
        expect(await accountRow(acc.id)).toMatchObject({
          reservedBalance: '0.00',
        });
      });

      it('timeout avant acceptation : UNKNOWN, jamais resoumis, déclaré non placé après le délai de grâce', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('TIMEOUT_BEFORE_ACCEPT');
        const d = await decision();
        const order = await orders.executeDecision(d, acc.id);
        expect(order).toMatchObject({ status: 'UNKNOWN' });
        await orders.executeDecision(d, acc.id);
        expect(sandbox.placeCallsFor(order!.idempotencyKey)).toBe(1);

        const pending = await reconcile(acc.id);
        expect(pending.criticalCount).toBe(0);
        expect(
          pending.items.find((i) => i.itemType === 'BALANCE'),
        ).toMatchObject({ result: 'PENDING', severity: 'WARNING' });
        expect(await orderOf(d)).toMatchObject({ status: 'UNKNOWN' });

        await reconcile(acc.id, later(6 * 60_000));
        expect(await orderOf(d)).toMatchObject({ status: 'REJECTED' });
        expect(await accountRow(acc.id)).toMatchObject({
          availableBalance: '1000.00',
          reservedBalance: '0.00',
        });
        expect(sandbox.placeCallsFor(order!.idempotencyKey)).toBe(1);
      });

      it('timeout après acceptation : retrouvé par sa clé, accepté sans second placement', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('TIMEOUT_AFTER_ACCEPT');
        const d = await decision();
        const order = await orders.executeDecision(d, acc.id);
        expect(order).toMatchObject({ status: 'UNKNOWN' });
        const run = await reconcile(acc.id);
        expect(run.criticalCount).toBe(0);
        expect(await orderOf(d)).toMatchObject({
          status: 'ACCEPTED',
          externalOrderId: expect.stringMatching(/^SBX-/),
        });
        expect(sandbox.placementsFor(order!.idempotencyKey)).toBe(1);
        expect(sandbox.placeCallsFor(order!.idempotencyKey)).toBe(1);
        expect(
          await dataSource
            .getRepository(BetReceipt)
            .countBy({ orderId: order!.id }),
        ).toBe(1);
      });

      it('visibilité retardée puis réponse malformée : UNKNOWN puis résolus par lecture', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('DELAYED', 'MALFORMED');
        const delayed = await decision();
        const malformed = await decision();
        expect(await orders.executeDecision(delayed, acc.id)).toMatchObject({
          status: 'UNKNOWN',
        });
        expect(await orders.executeDecision(malformed, acc.id)).toMatchObject({
          status: 'UNKNOWN',
        });

        await reconcile(acc.id);
        expect(await orderOf(delayed)).toMatchObject({ status: 'UNKNOWN' });
        expect(await orderOf(malformed)).toMatchObject({ status: 'ACCEPTED' });

        const run = await reconcile(acc.id);
        expect(await orderOf(delayed)).toMatchObject({ status: 'ACCEPTED' });
        expect(run.criticalCount).toBe(0);
        expect(run.items.find((i) => i.itemType === 'BALANCE')).toMatchObject({
          result: 'MATCH',
        });
      });

      it('UNKNOWN trop ancien : arrêt automatique', async () => {
        const acc = await sandboxAccount();
        sandbox.enqueue('TIMEOUT_BEFORE_ACCEPT');
        const d = await decision();
        await orders.executeDecision(d, acc.id);
        const run = await reconcile(acc.id, later(31 * 60_000));
        expect(run.criticalCount).toBeGreaterThan(0);
        expect(await orderOf(d)).toMatchObject({ status: 'UNKNOWN' });
        const row = await readControlRow();
        expect(row.mode).toBe('DISABLED');
        expect(row.stopReason).toContain('UNKNOWN_ORDER_TOO_OLD');
      });

      it('reçu dupliqué : RECONCILIATION_REQUIRED et arrêt automatique', async () => {
        const acc = await sandboxAccount();
        const first = await decision();
        await orders.executeDecision(first, acc.id);
        sandbox.enqueue('DUPLICATE_RECEIPT');
        const second = await decision();
        await expect(
          orders.executeDecision(second, acc.id),
        ).resolves.toMatchObject({
          status: 'RECONCILIATION_REQUIRED',
        });
        const row = await readControlRow();
        expect(row.mode).toBe('DISABLED');
        expect(row.stopReason).toContain('RECEIPT_INVALID');
        expect(
          await dataSource
            .getRepository(BetReceipt)
            .countBy({ orderId: (await orderOf(second)).id }),
        ).toBe(0);
        const run = await reconcile(acc.id);
        expect(run.criticalCount).toBeGreaterThan(0);
      });

      it('crash entre l’appel et la persistance : SUBMITTING périmé → UNKNOWN → retrouvé par clé', async () => {
        const acc = await sandboxAccount();
        const d = await decision();
        const reserved = await orders.reserve(d, acc.id);
        expect(reserved).toMatchObject({ status: 'RESERVED' });
        // Le process meurt après l'appel opérateur, avant d'avoir écrit le résultat.
        await dataSource.query(
          `UPDATE bet_orders SET status = 'SUBMITTING', requested_odd = 1.9,
           submitted_at = NOW(3) - INTERVAL 2 MINUTE, version = version + 1 WHERE id = ?`,
          [reserved!.id],
        );
        await sandbox.placeOrder({
          decisionId: d,
          idempotencyKey: reserved!.idempotencyKey,
          operatorKey: 'sandbox',
          fixtureId: reserved!.fixtureId,
          providerFixtureId: String(reserved!.providerFixtureId),
          marketKey: reserved!.marketKey,
          selectionKey: reserved!.selectionKey,
          requestedOdd: 1.9,
          minimumOdd: reserved!.minimumOdd,
          stake: reserved!.requestedStake,
          currency: 'EUR',
          quoteCapturedAt: new Date(),
        });
        await expect(orders.submit(reserved!.id)).resolves.toMatchObject({
          status: 'SUBMITTING',
        });

        const run = await reconcile(acc.id);
        expect(await orderOf(d)).toMatchObject({ status: 'ACCEPTED' });
        expect(sandbox.placeCallsFor(reserved!.idempotencyKey)).toBe(1);
        expect(run.criticalCount).toBe(0);
      });

      it('arrêt entre réservation et soumission : aucun appel opérateur, mise relâchée', async () => {
        const acc = await sandboxAccount();
        const d = await decision();
        const reserved = await orders.reserve(d, acc.id);
        await control.stop('arrêt entre réservation et soumission', ADMIN);
        await expect(orders.submit(reserved!.id)).resolves.toMatchObject({
          status: 'REJECTED',
          rejectionCode: 'CONTROL_DISABLED',
        });
        expect(sandbox.placeCallsFor(reserved!.idempotencyKey)).toBe(0);
        expect(await accountRow(acc.id)).toMatchObject({
          reservedBalance: '0.00',
        });
        expect(await keysOf(acc.id)).toEqual(['open', 'release', 'reserve']);
        await expect(
          orders.executeDecision(await decision(), acc.id),
        ).resolves.toBeNull();
      });

      it('opérateur bloqué : délai borné → UNKNOWN, arrêt manuel effectif pendant l’appel, retrouvé par clé sans resoumission', async () => {
        const acc = await sandboxAccount();
        let releaseOperator: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          releaseOperator = resolve;
        });
        let calls = 0;
        const stuck: OperatorPort = {
          kind: sandbox.kind,
          operatorKey: sandbox.operatorKey,
          getExecutableQuote: (input) => sandbox.getExecutableQuote(input),
          placeOrder: async (input) => {
            calls += 1;
            await gate;
            return sandbox.placeOrder(input);
          },
          getOrdersByIdempotencyKeys: (keys) =>
            sandbox.getOrdersByIdempotencyKeys(keys),
          getOrderByIdempotencyKey: (key) =>
            sandbox.getOrderByIdempotencyKey(key),
          getOrderByExternalId: (id) => sandbox.getOrderByExternalId(id),
          getBalance: (currency) => sandbox.getBalance(currency),
        };
        const slow = new OrderExecutionService(
          dataSource,
          control,
          risk,
          ledger,
          { SANDBOX: stuck },
          logger,
        );
        slow.submissionTimeoutMs = 1_500;

        const d = await decision();
        const submitting = slow.executeDecision(d, acc.id);
        while (calls === 0) await new Promise((r) => setTimeout(r, 10));

        const stopStartedAt = Date.now();
        await control.stop('arrêt pendant un appel bloqué', ADMIN);
        const stopWaitedMs = Date.now() - stopStartedAt;
        expect(stopWaitedMs).toBeLessThan(10_000);
        await expect(submitting).resolves.toMatchObject({ status: 'UNKNOWN' });
        expect((await control.readControl()).mode).toBe('DISABLED');

        // L'opérateur répond enfin : le placement a bien eu lieu, une seule fois.
        releaseOperator();
        const order = await orderOf(d);
        while (sandbox.placeCallsFor(order.idempotencyKey) === 0)
          await new Promise((r) => setTimeout(r, 10));
        await expect(
          slow.resolveUnknown(
            order,
            await sandbox.getOrderByIdempotencyKey(order.idempotencyKey),
          ),
        ).resolves.toBe('ACCEPTED');
        expect(calls).toBe(1);
        expect(sandbox.placeCallsFor(order.idempotencyKey)).toBe(1);
        expect(await orderOf(d)).toMatchObject({ status: 'ACCEPTED' });
      });

      it('solde opérateur divergent : écart critique et arrêt automatique', async () => {
        const acc = await sandboxAccount();
        await orders.executeDecision(await decision(), acc.id);
        sandbox.shiftBalance('EUR', -100);
        const run = await reconcile(acc.id);
        expect(run.items.find((i) => i.itemType === 'BALANCE')).toMatchObject({
          result: 'MISMATCH',
          severity: 'CRITICAL',
          expected: { available: '995.00', exposure: '5.00' },
          observed: { available: '994.00', exposure: '5.00' },
        });
        expect((await readControlRow()).stopReason).toContain(
          'OPERATOR_BALANCE_MISMATCH',
        );
      });

      it('run idempotent : même clé → même run, exécuté une fois', async () => {
        const acc = await sandboxAccount();
        const input = {
          accountId: acc.id,
          from: new Date(Date.now() - 3_600_000),
          to: new Date(),
          idempotencyKey: `it:idem:${acc.id}`,
        };
        const a = await reconciliation.open(input, ADMIN);
        const b = await reconciliation.open(input, ADMIN);
        expect(a.created).toBe(true);
        expect(b.created).toBe(false);
        expect(b.run.id).toBe(a.run.id);
      });

      it('double scheduler : verrou nommé, un seul run par compte et par créneau', async () => {
        const acc = await sandboxAccount();
        await orders.executeDecision(await decision(), acc.id);
        const scheduler = () =>
          new ReconciliationScheduler(
            { get: () => undefined } as unknown as ConfigService,
            {} as SchedulerRegistry,
            dataSource,
            reconciliation,
            control,
            logger,
          );

        const holder = dataSource.createQueryRunner();
        await holder.connect();
        await holder.query('SELECT GET_LOCK(?, 0)', [RECONCILIATION_LOCK]);
        await expect(scheduler().runTick()).resolves.toBe('SKIPPED_LOCKED');
        await holder.query('SELECT RELEASE_LOCK(?)', [RECONCILIATION_LOCK]);
        await holder.release();

        const now = new Date();
        const outcomes = await Promise.all([
          scheduler().runTick(now),
          scheduler().runTick(now),
        ]);
        expect(outcomes).toContain('DONE');
        const runs = await dataSource
          .getRepository(ReconciliationRun)
          .findBy({ accountId: acc.id });
        expect(
          runs.filter((r) => r.idempotencyKey.startsWith('auto:')),
        ).toHaveLength(1);
        expect(runs.every((r) => r.status === 'COMPLETED')).toBe(true);
      });
    });
  },
);

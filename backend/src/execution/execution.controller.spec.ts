import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { ChangeExecutionModeDto } from './dto/change-execution-mode.dto';
import { CreateRiskPolicyDto } from './dto/create-risk-policy.dto';
import { RecordGateEvidenceDto } from './dto/record-gate-evidence.dto';
import { StopExecutionDto } from './dto/stop-execution.dto';
import { ExecutionControlService } from './execution-control.service';
import { ExecutionController } from './execution.controller';
import { GatePolicyService } from './gate-policy.service';
import { OrderExecutionService } from './order-execution.service';
import { ReconciliationService } from './reconciliation.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { StartReconciliationDto } from './dto/start-reconciliation.dto';

const admin: AuthenticatedPrincipal = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  sessionId: 's',
};

const snapshot = {
  readable: true,
  mode: 'DISABLED',
  version: 3,
  activeRiskPolicyId: 'p1',
  stopReason: 'x',
  stopSource: 'MANUAL',
  changedByUserId: 'admin-1',
  changedAt: new Date(),
  realMoneyInterlockOpen: false,
};

const policy = {
  id: 'p1',
  version: 2,
  currency: 'EUR',
  maxStakePerBet: '10.00',
  maxDailyStake: '100.00',
  maxDailyLoss: '50.00',
  maxOpenExposure: '40.00',
  maxQuoteAgeMs: 30_000,
};

function setup() {
  const control = {
    readControl: jest.fn().mockResolvedValue(snapshot),
    activePolicy: jest.fn().mockResolvedValue(policy),
    stop: jest.fn().mockResolvedValue(snapshot),
    changeMode: jest.fn().mockResolvedValue(snapshot),
    createRiskPolicy: jest.fn().mockResolvedValue(policy),
    controlId: jest.fn().mockResolvedValue('c1'),
  };
  const gates = { record: jest.fn().mockResolvedValue({ id: 'e1' }) };
  const accounts = { findOneBy: jest.fn(), find: jest.fn() };
  const orders = {
    listOrders: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  };
  const reconciliation = {
    start: jest.fn().mockResolvedValue({ runId: 'r1' }),
    getRun: jest.fn(),
  };
  const runs = { find: jest.fn().mockResolvedValue([]) };
  const controller = new ExecutionController(
    control as unknown as ExecutionControlService,
    gates as unknown as GatePolicyService,
    accounts as unknown as Repository<BankrollAccount>,
    orders as unknown as OrderExecutionService,
    reconciliation as unknown as ReconciliationService,
    runs as unknown as Repository<ReconciliationRun>,
  );
  return { controller, control, gates, accounts, orders, reconciliation, runs };
}

async function errorsOf<T extends object>(cls: new () => T, raw: object) {
  return validate(plainToInstance(cls, raw));
}

describe('ExecutionController', () => {
  it('lecture VIEWER+, arrêt, mode, politiques et preuves ADMIN', () => {
    const proto = ExecutionController.prototype;
    const roles = (h: unknown) => Reflect.getMetadata(ROLES_KEY, h as object);
    expect(roles(proto.getControl)).toEqual([UserRole.VIEWER]);
    expect(roles(proto.getAccount)).toEqual([UserRole.VIEWER]);
    expect(roles(proto.stop)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.changeMode)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.createRiskPolicy)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.recordGateEvidence)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.listOrders)).toEqual([UserRole.VIEWER]);
    expect(roles(proto.startReconciliation)).toEqual([UserRole.OPERATOR]);
    expect(roles(proto.getReconciliation)).toEqual([UserRole.VIEWER]);
  });

  it('santé de réconciliation : NEVER_RUN puis dernier run', async () => {
    const { controller, runs } = setup();
    await expect(controller.getControl()).resolves.toMatchObject({
      reconciliation: {
        status: 'NEVER_RUN',
        lastRunAt: null,
        criticalCount: 0,
      },
    });
    const completedAt = new Date('2026-10-01T10:00:00Z');
    runs.find.mockResolvedValue([
      {
        status: 'COMPLETED',
        completedAt,
        createdAt: new Date(0),
        criticalCount: 2,
      },
    ]);
    await expect(controller.getControl()).resolves.toMatchObject({
      reconciliation: {
        status: 'COMPLETED',
        lastRunAt: completedAt,
        criticalCount: 2,
      },
    });
    runs.find.mockRejectedValue(new Error('down'));
    await expect(controller.getControl()).resolves.toMatchObject({
      reconciliation: { status: 'NEVER_RUN' },
    });
  });

  it('ordres : transmet les filtres avec une limite par défaut, refuse from >= to', async () => {
    const { controller, orders } = setup();
    await controller.listOrders(
      plainToInstance(ListOrdersQueryDto, { accountId: 'a1' }),
    );
    expect(orders.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a1', limit: 50 }),
    );
    const d = new Date('2026-10-01T00:00:00Z');
    expect(() =>
      controller.listOrders(
        Object.assign(new ListOrdersQueryDto(), { from: d, to: d }),
      ),
    ).toThrow(BadRequestException);
  });

  it('réconciliation : plage positive ≤ 31 jours, auteur transmis', async () => {
    const { controller, reconciliation } = setup();
    const base = { accountId: 'a1', idempotencyKey: 'manual:abcdef' };
    const from = new Date('2026-09-01T00:00:00Z');
    await expect(
      controller.startReconciliation(
        {
          ...base,
          from,
          to: new Date('2026-09-02T00:00:00Z'),
        } as StartReconciliationDto,
        admin,
      ),
    ).resolves.toEqual({ runId: 'r1' });
    expect(reconciliation.start).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a1' }),
      'admin-1',
    );
    expect(() =>
      controller.startReconciliation(
        {
          ...base,
          from,
          to: new Date('2026-10-03T00:00:00Z'),
        } as StartReconciliationDto,
        admin,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.startReconciliation(
        { ...base, from, to: from } as StartReconciliationDto,
        admin,
      ),
    ).toThrow(BadRequestException);
  });

  it('GET control expose état, limites actives et santé de réconciliation', async () => {
    const { controller } = setup();
    await expect(controller.getControl()).resolves.toMatchObject({
      mode: 'DISABLED',
      version: 3,
      activeLimits: {
        version: 2,
        maxStakePerBet: '10.00',
        maxOpenExposure: '40.00',
      },
      reconciliation: { status: 'NEVER_RUN' },
    });
  });

  it('GET control reste lisible si la politique ne l’est pas', async () => {
    const { controller, control } = setup();
    control.activePolicy.mockRejectedValue(new Error('down'));
    await expect(controller.getControl()).resolves.toMatchObject({
      activeLimits: null,
    });
  });

  it('arrêt : transmet motif, auteur et version', async () => {
    const { controller, control } = setup();
    await controller.stop({ reason: 'urgence', expectedVersion: 3 }, admin);
    expect(control.stop).toHaveBeenCalledWith(
      'urgence',
      'admin-1',
      'MANUAL',
      3,
    );
  });

  it('compte : soldes, exposition et limites dans la devise du compte', async () => {
    const { controller, accounts } = setup();
    accounts.findOneBy.mockResolvedValue({
      id: 'a1',
      mode: 'SIMULATION',
      operatorKey: 'virtual',
      currency: 'EUR',
      availableBalance: '90.10',
      reservedBalance: '9.90',
      version: 7,
    });
    await expect(controller.getAccount('a1')).resolves.toMatchObject({
      availableBalance: '90.10',
      reservedBalance: '9.90',
      exposure: '9.90',
      totalBalance: '100.00',
      activeLimits: { currency: 'EUR' },
    });

    accounts.findOneBy.mockResolvedValue({
      id: 'a2',
      mode: 'SIMULATION',
      operatorKey: 'virtual',
      currency: 'USD',
      availableBalance: '1.00',
      reservedBalance: '0.00',
      version: 1,
    });
    await expect(controller.getAccount('a2')).resolves.toMatchObject({
      activeLimits: null,
    });

    accounts.findOneBy.mockResolvedValue(null);
    await expect(controller.getAccount('a3')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('liste des comptes : VIEWER+, bornée, mêmes vues que le détail', async () => {
    const { controller, accounts, control } = setup();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ExecutionController.prototype.listAccounts,
      ),
    ).toEqual([UserRole.VIEWER]);
    accounts.find.mockResolvedValue([
      {
        id: 'a1',
        mode: 'SANDBOX',
        operatorKey: 'sandbox',
        currency: 'EUR',
        availableBalance: '90.10',
        reservedBalance: '9.90',
        version: 7,
      },
      {
        id: 'a2',
        mode: 'SIMULATION',
        operatorKey: 'virtual',
        currency: 'USD',
        availableBalance: '1.00',
        reservedBalance: '0.00',
        version: 1,
      },
    ]);
    const list = await controller.listAccounts();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: 'a1',
      totalBalance: '100.00',
      exposure: '9.90',
      activeLimits: { currency: 'EUR', version: 2 },
    });
    expect(list[1].activeLimits).toBeNull();
    expect(accounts.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(control.activePolicy).toHaveBeenCalledTimes(1);
  });

  it('liste des comptes : politique illisible → limites absentes, pas d’erreur', async () => {
    const { controller, accounts, control } = setup();
    control.activePolicy.mockRejectedValue(new Error('db'));
    accounts.find.mockResolvedValue([
      {
        id: 'a1',
        mode: 'SANDBOX',
        operatorKey: 'sandbox',
        currency: 'EUR',
        availableBalance: '1.00',
        reservedBalance: '0.00',
        version: 1,
      },
    ]);
    await expect(controller.listAccounts()).resolves.toEqual([
      expect.objectContaining({ id: 'a1', activeLimits: null }),
    ]);
  });

  it('refuse une politique incohérente (mise > budget du jour ou exposition)', async () => {
    const { controller, control } = setup();
    const dto = plainToInstance(CreateRiskPolicyDto, {
      currency: 'EUR',
      maxStakePerBet: '50',
      maxDailyStake: '40',
      maxDailyLoss: '10',
      maxOpenExposure: '100',
      maxQuoteAgeMs: 30_000,
      activate: false,
    });
    await expect(controller.createRiskPolicy(dto, admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(control.createRiskPolicy).not.toHaveBeenCalled();
  });

  it('une preuve de gate est rattachée au contrôle courant et à l’ADMIN qui l’enregistre', async () => {
    const { controller, gates } = setup();
    const dto = plainToInstance(RecordGateEvidenceDto, {
      gateKey: 'G2',
      periodFrom: '2026-09-01T00:00:00Z',
      periodTo: '2026-10-01T00:00:00Z',
      metrics: { runId: 'wf-1' },
      reportHash: 'a'.repeat(64),
      verdict: 'GO',
    });
    await controller.recordGateEvidence(dto, admin);
    expect(gates.record).toHaveBeenCalledWith(
      expect.objectContaining({ controlId: 'c1', gateKey: 'G2' }),
      'admin-1',
    );
  });

  it('refuse d’enregistrer une preuve si le contrôle est illisible', async () => {
    const { controller, control, gates } = setup();
    control.readControl.mockResolvedValue({ ...snapshot, readable: false });
    const dto = plainToInstance(RecordGateEvidenceDto, {
      gateKey: 'G2',
      periodFrom: '2026-09-01T00:00:00Z',
      periodTo: '2026-10-01T00:00:00Z',
      metrics: {},
      reportHash: 'a'.repeat(64),
      verdict: 'GO',
    });
    await expect(controller.recordGateEvidence(dto, admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(gates.record).not.toHaveBeenCalled();
  });

  describe('validation des DTO', () => {
    it.each([
      [StopExecutionDto, { reason: '   ' }],
      [StopExecutionDto, { reason: 'x'.repeat(501) }],
      [
        ChangeExecutionModeDto,
        {
          targetMode: 'LIVE',
          reason: 'x',
          expectedVersion: 1,
          gateEvidenceIds: [],
        },
      ],
      [
        ChangeExecutionModeDto,
        {
          targetMode: 'SANDBOX',
          reason: 'x',
          expectedVersion: 0,
          gateEvidenceIds: [],
        },
      ],
      [
        ChangeExecutionModeDto,
        {
          targetMode: 'SANDBOX',
          reason: 'x',
          expectedVersion: 1,
          gateEvidenceIds: ['pas-un-uuid'],
        },
      ],
      [
        CreateRiskPolicyDto,
        {
          currency: 'EUR',
          maxStakePerBet: '10.001',
          maxDailyStake: '1',
          maxDailyLoss: '1',
          maxOpenExposure: '1',
          maxQuoteAgeMs: 30_000,
          activate: true,
        },
      ],
      [
        CreateRiskPolicyDto,
        {
          currency: 'EUR',
          maxStakePerBet: 10,
          maxDailyStake: '1',
          maxDailyLoss: '1',
          maxOpenExposure: '1',
          maxQuoteAgeMs: 30_000,
          activate: true,
        },
      ],
      [
        CreateRiskPolicyDto,
        {
          currency: 'EUR',
          maxStakePerBet: '0.00',
          maxDailyStake: '1',
          maxDailyLoss: '1',
          maxOpenExposure: '1',
          maxQuoteAgeMs: 30_000,
          activate: true,
        },
      ],
      [
        RecordGateEvidenceDto,
        {
          gateKey: 'G7',
          periodFrom: '2026-09-01',
          periodTo: '2026-10-01',
          metrics: {},
          reportHash: 'a'.repeat(64),
          verdict: 'GO',
        },
      ],
      [
        RecordGateEvidenceDto,
        {
          gateKey: 'G2',
          periodFrom: '2026-09-01',
          periodTo: '2026-10-01',
          metrics: {},
          reportHash: 'A'.repeat(64),
          verdict: 'GO',
        },
      ],
      [
        RecordGateEvidenceDto,
        {
          gateKey: 'G2',
          periodFrom: '2026-09-01',
          periodTo: '2026-10-01',
          metrics: {},
          reportHash: 'a'.repeat(64),
          verdict: 'MAYBE',
        },
      ],
    ] as Array<[new () => object, object]>)(
      'refuse %p %j',
      async (cls, raw) => {
        expect((await errorsOf(cls, raw)).length).toBeGreaterThan(0);
      },
    );

    it('accepte un changement de mode bien formé', async () => {
      expect(
        await errorsOf(ChangeExecutionModeDto, {
          targetMode: 'SIMULATION',
          reason: 'G1 et G2 validées',
          expectedVersion: 3,
          gateEvidenceIds: ['8a4f6c1e-0000-4000-8000-000000000000'],
        }),
      ).toEqual([]);
    });
  });
});

import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, LessThan } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import { BetOrder } from '../database/entities/bet-order.entity';
import { BetReceipt } from '../database/entities/bet-receipt.entity';
import { ReconciliationItem } from '../database/entities/reconciliation-item.entity';
import { RiskPolicy } from '../database/entities/risk-policy.entity';
import { SimulationRun } from '../database/entities/simulation-run.entity';
import {
  redactErrorMessage,
  redactReceipt,
} from './adapters/operator-receipt-redactor';
import {
  ExecutionBlockedError,
  ExecutionControlService,
} from './execution-control.service';
import {
  AutoStopTrigger,
  DECISION_BUCKET_MS,
  DecisionOutcome,
  ExecutionMode,
  OrderStatus,
  RejectionCode,
  SUBMISSION_TIMEOUT_MS,
  SUBMITTING_STALE_MS,
  UNKNOWN_GRACE_MS,
  UNKNOWN_MAX_AGE_MS,
  fromCents,
  isExecutionMode,
  toCents,
} from './execution.types';
import { LedgerService } from './ledger.service';
import {
  OPERATOR_PORTS,
  OperatorOrder,
  OperatorPort,
  OperatorPortsByMode,
  PlaceOrderResult,
  isWellFormedAcceptance,
} from './operator.port';
import {
  AutoStopRequest,
  LEDGER_ISOLATION,
  RiskEngineService,
} from './risk-engine.service';

/**
 * Clé d'idempotence d'ordre (PLAN 3.4) : déterministe sur mode, opérateur, fixture, marché,
 * sélection, version de stratégie et créneau de décision. Transmise telle quelle à
 * l'opérateur ; un timeout ne la change jamais.
 */
export function orderIdempotencyKey(input: {
  mode: ExecutionMode;
  operatorKey: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  strategyVersion: string;
  decidedAt: Date;
}): string {
  const bucket = Math.floor(input.decidedAt.getTime() / DECISION_BUCKET_MS);
  return createHash('sha256')
    .update(
      [
        input.mode,
        input.operatorKey,
        input.fixtureId,
        input.marketKey,
        input.selectionKey,
        input.strategyVersion,
        String(bucket),
      ].join('|'),
    )
    .digest('hex');
}

/** Résultat opérateur d'un ordre réglé, vu du parieur : profit = gain brut − mise. */
export interface OrderView {
  id: string;
  decisionId: string;
  accountId: string;
  mode: string;
  operatorKey: string;
  status: OrderStatus;
  rejectionCode: RejectionCode | null;
  statusReason: string | null;
  externalOrderId: string | null;
  currency: string;
  requestedStake: string;
  requestedOdd: number;
  minimumOdd: number;
  acceptedStake: string | null;
  acceptedOdd: number | null;
  payout: string | null;
  createdAt: Date;
  settledAt: Date | null;
  receipt: { receiptHash: string; redactedPayload: unknown } | null;
  reconciliation: { result: string; severity: string; checkedAt: Date } | null;
}

export function decodeOrderCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      /^[0-9a-f-]{36}$/i.test(parsed[1]) &&
      !Number.isNaN(new Date(parsed[0]).getTime())
    ) {
      return { createdAt: new Date(parsed[0]), id: parsed[1] };
    }
  } catch {
    // curseur illisible
  }
  throw new BadRequestException('Curseur invalide');
}

export function settlementOutcome(
  stake: string,
  payout: string,
): { outcome: DecisionOutcome; profitCents: number } {
  const stakeCents = toCents(stake);
  const payoutCents = toCents(payout);
  const profitCents = payoutCents - stakeCents;
  if (payoutCents === stakeCents) return { outcome: 'VOID', profitCents: 0 };
  return { outcome: profitCents > 0 ? 'WON' : 'LOST', profitCents };
}

/**
 * Borne un appel opérateur. Le dépassement rejette (→ UNKNOWN) ; la réponse tardive éventuelle
 * est ignorée ici et retrouvée plus tard par lecture de la même clé.
 */
export function boundedSubmission<T>(
  call: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Délai de soumission dépassé (${timeoutMs} ms)`)),
      timeoutMs,
    );
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

const REJECTION_BY_OPERATOR_REASON: Record<string, RejectionCode> = {
  ODD_MOVED: 'ODD_MOVED',
  NO_QUOTE: 'NO_EXECUTABLE_ODD',
  MARKET_SUSPENDED: 'SUSPENDED_MARKET',
};

export type UnknownResolution =
  | 'ACCEPTED'
  | 'SETTLED'
  | 'REJECTED'
  | 'DECLARED_NOT_PLACED'
  | 'PENDING'
  | 'TOO_OLD'
  | 'RECONCILIATION_REQUIRED';

/**
 * Pipeline d'ordre : réservation atomique (ordre + mise) → revérification juste avant
 * l'appel → soumission UNIQUE hors transaction → persistance du résultat et du reçu
 * expurgé → règlement ou relâchement du ledger. Une ambiguïté (timeout, réponse
 * malformée, crash) produit UNKNOWN : l'ordre n'est plus jamais soumis, seulement relu
 * chez l'opérateur par sa clé.
 */
@Injectable()
export class OrderExecutionService {
  /** Modifiable uniquement par les tests ; voir SUBMISSION_TIMEOUT_MS. */
  submissionTimeoutMs = SUBMISSION_TIMEOUT_MS;

  constructor(
    private readonly dataSource: DataSource,
    private readonly control: ExecutionControlService,
    private readonly risk: RiskEngineService,
    private readonly ledger: LedgerService,
    @Inject(OPERATOR_PORTS) private readonly ports: OperatorPortsByMode,
    private readonly logger: JsonLogger,
  ) {}

  /** LIVE_CANARY n'a aucun adaptateur avant le lot 8 : refus systématique. */
  portFor(mode: string): OperatorPort {
    const port =
      isExecutionMode(mode) && mode !== 'LIVE_CANARY'
        ? this.ports[mode]
        : undefined;
    if (!port) {
      throw new ExecutionBlockedError(
        `Aucun adaptateur opérateur pour le mode ${mode}`,
        false,
      );
    }
    return port;
  }

  /** Exécute une décision ELIGIBLE. Rappelable : renvoie l'ordre existant, ne resoumet jamais. */
  async executeDecision(
    decisionId: string,
    accountId: string,
  ): Promise<BetOrder | null> {
    const order = await this.reserve(decisionId, accountId);
    if (!order || order.status !== 'RESERVED') return order;
    return this.submit(order.id);
  }

  // ── 1. Réservation atomique ────────────────────────────────────────────────

  async reserve(
    decisionId: string,
    accountId: string,
  ): Promise<BetOrder | null> {
    let pendingStop: AutoStopRequest | null = null;
    let rejection: { code: RejectionCode; reason: string } | null = null;
    let order: BetOrder | null = null;

    try {
      order = await this.dataSource.transaction(
        LEDGER_ISOLATION,
        async (manager) => {
          const orders = manager.getRepository(BetOrder);
          const existing = await orders.findOneBy({ decisionId });
          if (existing) return existing;

          const control = await this.control.lockForExecution(manager);
          const port = this.portFor(control.mode);

          const decision = await manager
            .getRepository(BetDecision)
            .createQueryBuilder('d')
            .setLock('pessimistic_write')
            .where('d.id = :id', { id: decisionId })
            .getOne();
          if (!decision)
            throw new NotFoundException(`Décision ${decisionId} introuvable`);
          if (decision.status !== 'ELIGIBLE') return null;
          if (
            decision.decisionOdd === null ||
            decision.stake === null ||
            !decision.decisionObservedAt
          ) {
            await this.rejectDecision(
              manager,
              decision.id,
              'NO_EXECUTABLE_ODD',
            );
            return null;
          }

          const run = await manager
            .getRepository(SimulationRun)
            .findOneByOrFail({ id: decision.simulationRunId });
          const idempotencyKey = orderIdempotencyKey({
            mode: control.mode as ExecutionMode,
            operatorKey: port.operatorKey,
            fixtureId: decision.fixtureId,
            marketKey: decision.marketKey,
            selectionKey: decision.selectionKey,
            strategyVersion: run.strategyVersion,
            decidedAt: decision.decidedAt,
          });
          if (await orders.findOneBy({ idempotencyKey })) {
            // Même signal dans le même créneau : un seul ordre possible.
            await this.rejectDecision(
              manager,
              decision.id,
              'RISK_CHECK_FAILED',
            );
            return null;
          }

          const orderId = randomUUID();
          await orders.insert({
            id: orderId,
            decisionId: decision.id,
            accountId,
            mode: control.mode,
            operatorKey: port.operatorKey,
            idempotencyKey,
            externalOrderId: null,
            status: 'RESERVED',
            rejectionCode: null,
            statusReason: null,
            fixtureId: decision.fixtureId,
            providerFixtureId: decision.providerFixtureId,
            marketKey: decision.marketKey,
            selectionKey: decision.selectionKey,
            currency: decision.currency,
            requestedStake: decision.stake,
            requestedOdd: decision.decisionOdd,
            minimumOdd: decision.minAcceptableOdd,
            quoteCapturedAt: decision.decisionObservedAt,
            version: 1,
          });

          const reservation = await this.risk.reserveWithin(
            manager,
            {
              accountId,
              entryKey: `reserve:${idempotencyKey}`,
              stake: decision.stake,
              quoteCapturedAt: decision.decisionObservedAt,
              orderId,
            },
            (stop) => {
              pendingStop = stop;
            },
          );
          if (reservation.status === 'REJECTED') {
            await this.transition(manager, orderId, 1, {
              status: 'REJECTED',
              rejectionCode: reservation.code,
              statusReason: reservation.reason.slice(0, 255),
            });
            await this.rejectDecision(manager, decision.id, reservation.code);
          } else {
            await manager
              .getRepository(BetDecision)
              .update({ id: decision.id }, { status: 'ORDER_RESERVED' });
          }
          return orders.findOneByOrFail({ id: orderId });
        },
      );
    } catch (error) {
      const classified = this.risk.classifyReservationError(
        error,
        decisionId,
        pendingStop,
      );
      pendingStop = classified.autoStop;
      if (classified.result.status === 'REJECTED') {
        rejection = {
          code: classified.result.code,
          reason: classified.result.reason,
        };
      }
    }

    if (rejection) {
      await this.dataSource.transaction(LEDGER_ISOLATION, (manager) =>
        this.rejectDecision(manager, decisionId, rejection!.code, 'ELIGIBLE'),
      );
    }
    await this.applyStop(pendingStop);
    return order;
  }

  // ── 2-4. Revérification, soumission unique, persistance ────────────────────

  async submit(orderId: string): Promise<BetOrder> {
    const reserved = await this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
    if (reserved.status !== 'RESERVED') return reserved;

    let port: OperatorPort;
    try {
      port = this.portFor(reserved.mode);
    } catch {
      return this.cancelReserved(
        reserved,
        'CONTROL_DISABLED',
        'Mode sans adaptateur',
      );
    }

    // Cote relue AVANT la transaction : aucun appel réseau sous verrou.
    const quote = await port
      .getExecutableQuote({
        target: {
          providerFixtureId: String(reserved.providerFixtureId),
          marketKey: reserved.marketKey,
          selectionKey: reserved.selectionKey,
        },
        at: new Date(),
        maxQuoteAgeMs: 600_000,
      })
      .catch(() => null);

    let cancel: { code: RejectionCode; reason: string } | null = null;
    let stop: AutoStopRequest | null = null;
    let order: BetOrder;
    try {
      order = await this.dataSource.transaction(
        LEDGER_ISOLATION,
        async (manager) => {
          const control = await this.control.lockForExecution(manager);
          const current = await manager
            .getRepository(BetOrder)
            .createQueryBuilder('o')
            .setLock('pessimistic_write')
            .where('o.id = :id', { id: orderId })
            .getOneOrFail();
          if (current.status !== 'RESERVED') return current;
          if (control.mode !== current.mode) {
            cancel = {
              code: 'CONTROL_DISABLED',
              reason: `Mode passé à ${control.mode}`,
            };
            return current;
          }
          const policy = control.activeRiskPolicyId
            ? await manager
                .getRepository(RiskPolicy)
                .findOneBy({ id: control.activeRiskPolicyId })
            : null;
          if (!quote || !quote.available) {
            cancel = {
              code: 'NO_EXECUTABLE_ODD',
              reason: 'Aucune cote exécutable avant soumission',
            };
            return current;
          }
          const age = Date.now() - quote.capturedAt.getTime();
          if (!policy || age < 0 || age > policy.maxQuoteAgeMs) {
            cancel = {
              code: 'STALE_ODD',
              reason: 'Cote périmée avant soumission',
            };
            stop = { trigger: 'STALE_OR_SUSPENDED_ODD', details: { orderId } };
            return current;
          }
          if (quote.oddValue < current.minimumOdd) {
            cancel = {
              code: 'ODD_MOVED',
              reason: `Cote ${quote.oddValue} sous le minimum ${current.minimumOdd}`,
            };
            return current;
          }
          await this.transition(manager, current.id, current.version, {
            status: 'SUBMITTING',
            requestedOdd: quote.oddValue,
            submittedAt: new Date(),
          });
          return manager
            .getRepository(BetOrder)
            .findOneByOrFail({ id: orderId });
        },
      );
    } catch (error) {
      const blocked = error instanceof ExecutionBlockedError;
      cancel = {
        code: blocked ? 'CONTROL_DISABLED' : 'RISK_CHECK_FAILED',
        reason: redactErrorMessage(error),
      };
      if (blocked && error.unreadable)
        stop = { trigger: 'CONTROL_UNREADABLE', details: {} };
      order = reserved;
    }

    if (cancel) {
      await this.applyStop(stop);
      return this.cancelReserved(order, cancel.code, cancel.reason);
    }
    if (order.status !== 'SUBMITTING') return order;
    if (!isExecutionMode(order.mode)) {
      return this.cancelSubmitting(
        order,
        'CONTROL_DISABLED',
        'Mode d’exécution invalide avant soumission',
      );
    }

    let result: PlaceOrderResult;
    try {
      result = await this.control.withSubmissionPermit(order.mode, async () =>
        boundedSubmission(
          port.placeOrder({
            decisionId: order.decisionId,
            idempotencyKey: order.idempotencyKey,
            operatorKey: order.operatorKey,
            fixtureId: order.fixtureId,
            providerFixtureId: String(order.providerFixtureId),
            marketKey: order.marketKey,
            selectionKey: order.selectionKey,
            requestedOdd: order.requestedOdd,
            minimumOdd: order.minimumOdd,
            stake: order.requestedStake,
            currency: order.currency,
            quoteCapturedAt: order.quoteCapturedAt,
          }),
          this.submissionTimeoutMs,
        ),
      );
    } catch (error) {
      if (error instanceof ExecutionBlockedError) {
        if (error.unreadable) {
          await this.control.autoStop('CONTROL_UNREADABLE', { orderId });
        }
        return this.cancelSubmitting(
          order,
          'CONTROL_DISABLED',
          'Arrêt juste avant soumission',
        );
      }
      result = { status: 'UNKNOWN', reason: redactErrorMessage(error) };
    }
    this.logger.log(
      { event: 'order_submitted', orderId: order.id, result: result.status },
      'OrderExecutionService',
    );
    return this.applyPlacementResult(order.id, result, port);
  }

  /** Applique la réponse de placement. Une acceptation malformée est traitée comme UNKNOWN. */
  async applyPlacementResult(
    orderId: string,
    result: PlaceOrderResult,
    port: OperatorPort,
  ): Promise<BetOrder> {
    if (result.status === 'ACCEPTED' && !isWellFormedAcceptance(result)) {
      result = { status: 'UNKNOWN', reason: 'Réponse d’acceptation malformée' };
    }
    if (result.status === 'ACCEPTED') {
      return this.applyAcceptance(orderId, {
        externalOrderId: result.externalOrderId,
        idempotencyKey: '',
        status: 'ACCEPTED',
        acceptedOdd: result.acceptedOdd,
        acceptedStake: result.acceptedStake,
        acceptedAt: result.acceptedAt,
        receiptHash: result.receiptHash,
        payout: null,
        settledAt: null,
        rawReceipt: result.rawReceipt,
      });
    }
    if (result.status === 'REJECTED') {
      const code =
        REJECTION_BY_OPERATOR_REASON[result.reasonCode] ??
        'OPERATOR_UNAVAILABLE';
      const order = await this.dataSource
        .getRepository(BetOrder)
        .findOneByOrFail({ id: orderId });
      return this.cancelSubmitting(
        order,
        code,
        `Refus opérateur ${result.reasonCode}`.slice(0, 255),
      );
    }
    void port;
    await this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const order = await this.lockOrder(manager, orderId);
      if (order.status !== 'SUBMITTING') return;
      await this.transition(manager, order.id, order.version, {
        status: 'UNKNOWN',
        unknownSince: new Date(),
        statusReason: redactErrorMessage(
          result.status === 'UNKNOWN' ? result.reason : 'inconnu',
        ),
      });
    });
    return this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
  }

  /**
   * Inscrit une acceptation : reçu expurgé (hash unique), identifiant externe, mise et cote
   * acceptées. Toute incohérence contractuelle (cote sous le minimum, mise supérieure,
   * reçu absent ou déjà utilisé) place l'ordre en RECONCILIATION_REQUIRED et arrête tout.
   */
  async applyAcceptance(
    orderId: string,
    accepted: OperatorOrder,
  ): Promise<BetOrder> {
    let stop: AutoStopRequest | null = null;
    await this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const order = await this.lockOrder(manager, orderId);
      if (!['SUBMITTING', 'UNKNOWN', 'RESERVED'].includes(order.status)) return;

      const receipts = manager.getRepository(BetReceipt);
      const violation = this.acceptanceViolation(order, accepted);
      const receiptTaken =
        accepted.receiptHash !== null &&
        (await receipts.findOneBy({ receiptHash: accepted.receiptHash })) !==
          null;
      const externalTaken =
        accepted.externalOrderId !== null &&
        (await manager.getRepository(BetOrder).findOne({
          where: {
            operatorKey: order.operatorKey,
            externalOrderId: accepted.externalOrderId,
          },
        })) !== null;

      if (violation || receiptTaken || externalTaken) {
        stop = {
          trigger:
            receiptTaken || !accepted.receiptHash
              ? 'RECEIPT_INVALID'
              : 'OPERATOR_CONTRACT_VIOLATION',
          details: { orderId },
        };
        await this.transition(manager, order.id, order.version, {
          status: 'RECONCILIATION_REQUIRED',
          statusReason: (
            violation ??
            (receiptTaken
              ? 'Reçu déjà utilisé par un autre ordre'
              : 'Identifiant externe déjà utilisé')
          ).slice(0, 255),
          unknownSince: order.unknownSince ?? new Date(),
        });
        return;
      }

      await receipts.insert({
        orderId: order.id,
        receiptHash: accepted.receiptHash!,
        redactedPayload: redactReceipt(accepted.rawReceipt),
      });
      await this.transition(manager, order.id, order.version, {
        status: 'ACCEPTED',
        externalOrderId: accepted.externalOrderId,
        acceptedOdd: accepted.acceptedOdd,
        acceptedStake: accepted.acceptedStake,
        acceptedAt: accepted.acceptedAt,
        statusReason: null,
      });

      const unused =
        toCents(order.requestedStake) - toCents(accepted.acceptedStake!);
      if (unused > 0) {
        const account = await this.ledger.lockAccount(manager, order.accountId);
        await this.ledger.append(manager, account, {
          type: 'RELEASE',
          entryKey: `release-partial:${order.idempotencyKey}`,
          movement: { stakeCents: unused },
          orderId: order.id,
        });
      }

      const decision = await manager
        .getRepository(BetDecision)
        .findOneByOrFail({ id: order.decisionId });
      await manager.getRepository(BetDecision).update(
        { id: decision.id },
        {
          executableOdd: accepted.acceptedOdd,
          executedAt: new Date(),
          slippagePct:
            decision.decisionOdd !== null
              ? Math.round(
                  ((accepted.acceptedOdd! - decision.decisionOdd) /
                    decision.decisionOdd) *
                    1e6,
                ) / 1e4
              : null,
        },
      );
    });
    await this.applyStop(stop);
    return this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
  }

  /** Règle un ordre accepté que l'opérateur déclare réglé ou annulé. Idempotent. */
  async settleFromOperator(
    orderId: string,
    operatorOrder: OperatorOrder,
  ): Promise<BetOrder> {
    const order = await this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
    if (order.status !== 'ACCEPTED') return order;
    if (
      (operatorOrder.status !== 'SETTLED' &&
        operatorOrder.status !== 'VOIDED') ||
      operatorOrder.payout === null ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(operatorOrder.payout)
    ) {
      return order;
    }
    const stake = order.acceptedStake!;
    await this.risk.settleStake({
      accountId: order.accountId,
      entryKey: `settle:${order.idempotencyKey}`,
      stake,
      payout: operatorOrder.payout,
      orderId: order.id,
    });
    const { outcome, profitCents } = settlementOutcome(
      stake,
      operatorOrder.payout,
    );
    await this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const current = await this.lockOrder(manager, orderId);
      if (current.status !== 'ACCEPTED') return;
      const settledAt = operatorOrder.settledAt ?? new Date();
      await this.transition(manager, current.id, current.version, {
        status: outcome === 'VOID' ? 'VOIDED' : 'SETTLED',
        payout: operatorOrder.payout,
        settledAt,
      });
      await manager.getRepository(BetDecision).update(
        { id: current.decisionId },
        {
          status: 'COMPLETED',
          outcome,
          profit: fromCents(profitCents),
          settledAt,
        },
      );
    });
    return this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
  }

  /**
   * Sortie d'UNKNOWN : UNIQUEMENT par lecture opérateur avec la même clé. Introuvable après
   * le délai de grâce : déclaré non placé et la mise est relâchée ; trop ancien : arrêt.
   */
  async resolveUnknown(
    order: BetOrder,
    operatorOrder: OperatorOrder | null,
    now: Date = new Date(),
  ): Promise<UnknownResolution> {
    if (order.status !== 'UNKNOWN') return 'PENDING';
    const age =
      now.getTime() - (order.unknownSince ?? order.updatedAt).getTime();

    if (operatorOrder) {
      if (operatorOrder.status === 'REJECTED') {
        await this.cancelUnknown(
          order,
          'OPERATOR_UNAVAILABLE',
          'Refus confirmé par lecture opérateur',
        );
        return 'REJECTED';
      }
      const accepted = await this.applyAcceptance(order.id, operatorOrder);
      if (accepted.status === 'RECONCILIATION_REQUIRED')
        return 'RECONCILIATION_REQUIRED';
      if (
        operatorOrder.status === 'SETTLED' ||
        operatorOrder.status === 'VOIDED'
      ) {
        await this.settleFromOperator(order.id, operatorOrder);
        return 'SETTLED';
      }
      return 'ACCEPTED';
    }

    if (age >= UNKNOWN_MAX_AGE_MS) {
      await this.control.autoStop('UNKNOWN_ORDER_TOO_OLD', {
        orderId: order.id,
      });
      return 'TOO_OLD';
    }
    if (age >= UNKNOWN_GRACE_MS) {
      await this.cancelUnknown(
        order,
        'OPERATOR_UNAVAILABLE',
        'Absent chez l’opérateur après le délai de grâce',
      );
      return 'DECLARED_NOT_PLACED';
    }
    return 'PENDING';
  }

  /** Crash entre l'appel et la persistance : un SUBMITTING trop vieux devient UNKNOWN, jamais resoumis. */
  async recoverStaleSubmissions(now: Date = new Date()): Promise<number> {
    const stale = await this.dataSource.getRepository(BetOrder).find({
      where: {
        status: 'SUBMITTING',
        submittedAt: LessThan(new Date(now.getTime() - SUBMITTING_STALE_MS)),
      },
    });
    if (!stale.length) return 0;
    const result = await this.dataSource
      .createQueryBuilder()
      .update(BetOrder)
      .set({
        status: 'UNKNOWN',
        unknownSince: () => 'submitted_at',
        statusReason: 'Soumission interrompue : résultat inconnu',
        version: () => 'version + 1',
        updatedAt: () => 'CURRENT_TIMESTAMP(6)',
      })
      .where({ id: In(stale.map((o) => o.id)), status: 'SUBMITTING' })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Ordres filtrés et paginés (curseur createdAt/id décroissant), avec reçu expurgé et
   * dernier statut de rapprochement : trois lectures, quelle que soit la page.
   */
  async listOrders(filters: {
    accountId?: string;
    status?: OrderStatus;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit: number;
  }): Promise<{ data: OrderView[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filters.limit, 1), 200);
    const query = this.dataSource
      .getRepository(BetOrder)
      .createQueryBuilder('o');
    if (filters.accountId)
      query.andWhere('o.accountId = :accountId', {
        accountId: filters.accountId,
      });
    if (filters.status)
      query.andWhere('o.status = :status', { status: filters.status });
    if (filters.from)
      query.andWhere('o.createdAt >= :from', { from: filters.from });
    if (filters.to) query.andWhere('o.createdAt < :to', { to: filters.to });
    if (filters.cursor) {
      const cursor = decodeOrderCursor(filters.cursor);
      query.andWhere(
        '(o.createdAt < :cursorAt OR (o.createdAt = :cursorAt AND o.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }
    const rows = await query
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    const ids = page.map((o) => o.id);
    const [receipts, items] = ids.length
      ? await Promise.all([
          this.dataSource
            .getRepository(BetReceipt)
            .findBy({ orderId: In(ids) }),
          this.dataSource.getRepository(ReconciliationItem).find({
            where: { orderId: In(ids) },
            order: { createdAt: 'DESC' },
            select: {
              orderId: true,
              result: true,
              severity: true,
              createdAt: true,
            },
          }),
        ])
      : [[], []];
    const receiptByOrder = new Map(receipts.map((r) => [r.orderId, r]));
    const lastItemByOrder = new Map<string, ReconciliationItem>();
    for (const it of items) {
      if (it.orderId && !lastItemByOrder.has(it.orderId))
        lastItemByOrder.set(it.orderId, it);
    }
    return {
      data: page.map((o) => {
        const receipt = receiptByOrder.get(o.id);
        const last = lastItemByOrder.get(o.id);
        return {
          id: o.id,
          decisionId: o.decisionId,
          accountId: o.accountId,
          mode: o.mode,
          operatorKey: o.operatorKey,
          status: o.status,
          rejectionCode: o.rejectionCode,
          statusReason: o.statusReason,
          externalOrderId: o.externalOrderId,
          currency: o.currency,
          requestedStake: o.requestedStake,
          requestedOdd: o.requestedOdd,
          minimumOdd: o.minimumOdd,
          acceptedStake: o.acceptedStake,
          acceptedOdd: o.acceptedOdd,
          payout: o.payout,
          createdAt: o.createdAt,
          settledAt: o.settledAt,
          receipt: receipt
            ? {
                receiptHash: receipt.receiptHash,
                redactedPayload: receipt.redactedPayload,
              }
            : null,
          reconciliation: last
            ? {
                result: last.result,
                severity: last.severity,
                checkedAt: last.createdAt,
              }
            : null,
        };
      }),
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify([
                page[page.length - 1].createdAt.toISOString(),
                page[page.length - 1].id,
              ]),
            ).toString('base64url')
          : null,
    };
  }

  /** Réservation jamais soumise (crash avant l'appel) : rien n'a été envoyé, on relâche. */
  async cancelAbandoned(orderId: string): Promise<boolean> {
    return (await this.cancelAbandonedBatch([orderId])).includes(orderId);
  }

  /** Annule des réservations abandonnées d'un même compte en une transaction groupée. */
  async cancelAbandonedBatch(orderIds: readonly string[]): Promise<string[]> {
    const ids = [...new Set(orderIds)];
    if (!ids.length) return [];
    return this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const orders = await manager
        .getRepository(BetOrder)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id IN (:...ids)', { ids })
        .andWhere('o.status = :status', { status: 'RESERVED' })
        .orderBy('o.id', 'ASC')
        .getMany();
      if (!orders.length) return [];
      const accountIds = [...new Set(orders.map((order) => order.accountId))];
      if (accountIds.length !== 1) {
        throw new Error('Un lot d’annulation doit cibler un seul compte');
      }
      const account = await this.ledger.lockAccount(manager, accountIds[0]);
      const reserveKeys = orders.map(
        (order) => `reserve:${order.idempotencyKey}`,
      );
      const reserves = await manager
        .getRepository(BankrollLedgerEntry)
        .findBy({ entryKey: In(reserveKeys) });
      const reservedKeys = new Set(reserves.map((entry) => entry.entryKey));
      const releasable = orders.filter((order) =>
        reservedKeys.has(`reserve:${order.idempotencyKey}`),
      );
      await this.ledger.appendBatch(
        manager,
        account,
        releasable.map((order) => ({
          type: 'RELEASE' as const,
          entryKey: `release:${order.idempotencyKey}`,
          movement: { stakeCents: toCents(order.requestedStake) },
          orderId: order.id,
        })),
      );
      const cancelledIds = releasable.map((order) => order.id);
      if (!cancelledIds.length) return [];
      await manager
        .createQueryBuilder()
        .update(BetOrder)
        .set({
          status: 'REJECTED',
          rejectionCode: 'OPERATOR_UNAVAILABLE',
          statusReason: 'Réservation abandonnée avant soumission',
          version: () => 'version + 1',
          updatedAt: () => 'CURRENT_TIMESTAMP(6)',
        })
        .where('id IN (:...ids)', { ids: cancelledIds })
        .andWhere('status = :status', { status: 'RESERVED' })
        .execute();
      await manager
        .getRepository(BetDecision)
        .update(
          { id: In(releasable.map((order) => order.decisionId)) },
          { status: 'REJECTED', rejectionCode: 'OPERATOR_UNAVAILABLE' },
        );
      return cancelledIds;
    });
  }

  /** Invariant du ledger sans arrêt : la réconciliation décide de la suite. */
  async ledgerInvariantOk(accountId: string): Promise<boolean> {
    return (await this.ledger.verifyInvariant(accountId)).ok;
  }

  // ── Internes ────────────────────────────────────────────────────────────────

  private acceptanceViolation(
    order: BetOrder,
    accepted: OperatorOrder,
  ): string | null {
    if (!accepted.receiptHash || !/^[0-9a-f]{64}$/.test(accepted.receiptHash))
      return 'Reçu absent ou illisible';
    if (!accepted.externalOrderId) return 'Identifiant externe absent';
    if (
      accepted.acceptedOdd === null ||
      !(accepted.acceptedOdd >= order.minimumOdd)
    ) {
      return `Cote acceptée ${accepted.acceptedOdd} sous le minimum ${order.minimumOdd}`;
    }
    if (
      accepted.acceptedStake === null ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(accepted.acceptedStake) ||
      toCents(accepted.acceptedStake) <= 0 ||
      toCents(accepted.acceptedStake) > toCents(order.requestedStake)
    ) {
      return `Mise acceptée ${accepted.acceptedStake} incohérente`;
    }
    return null;
  }

  private async lockOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<BetOrder> {
    return manager
      .getRepository(BetOrder)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.id = :id', { id: orderId })
      .getOneOrFail();
  }

  /** Transition versionnée : refuse silencieusement d'écrire sur une version périmée. */
  private async transition(
    manager: EntityManager,
    orderId: string,
    expectedVersion: number,
    patch: Partial<BetOrder> & { status?: OrderStatus },
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(BetOrder)
      .set({
        ...patch,
        version: () => 'version + 1',
        updatedAt: () => 'CURRENT_TIMESTAMP(6)',
      })
      .where('id = :id AND version = :version', {
        id: orderId,
        version: expectedVersion,
      })
      .execute();
    if (result.affected !== 1) {
      throw new Error(`Ordre ${orderId} modifié concurremment`);
    }
  }

  private async rejectDecision(
    manager: EntityManager,
    decisionId: string,
    code: RejectionCode,
    onlyFrom?: string,
  ): Promise<void> {
    await manager
      .getRepository(BetDecision)
      .update(
        onlyFrom
          ? { id: decisionId, status: onlyFrom as never }
          : { id: decisionId },
        {
          status: 'REJECTED',
          rejectionCode: code,
        },
      );
  }

  /** Annule un ordre jamais soumis : relâche la mise, rejette la décision. */
  private async cancelReserved(
    order: BetOrder,
    code: RejectionCode,
    reason: string,
  ): Promise<BetOrder> {
    return this.cancel(order.id, ['RESERVED'], code, reason);
  }

  /** Annule un ordre SUBMITTING dont on SAIT qu'il n'a pas été placé (refus explicite, arrêt avant appel). */
  private async cancelSubmitting(
    order: BetOrder,
    code: RejectionCode,
    reason: string,
  ): Promise<BetOrder> {
    return this.cancel(order.id, ['SUBMITTING', 'RESERVED'], code, reason);
  }

  private async cancelUnknown(
    order: BetOrder,
    code: RejectionCode,
    reason: string,
  ): Promise<void> {
    await this.cancel(order.id, ['UNKNOWN'], code, reason);
  }

  private async cancel(
    orderId: string,
    from: OrderStatus[],
    code: RejectionCode,
    reason: string,
  ): Promise<BetOrder> {
    await this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const order = await this.lockOrder(manager, orderId);
      if (!from.includes(order.status)) return;
      const reserveKey = `reserve:${order.idempotencyKey}`;
      if (await this.ledger.findEntry(manager, reserveKey)) {
        const account = await this.ledger.lockAccount(manager, order.accountId);
        await this.ledger.append(manager, account, {
          type: 'RELEASE',
          entryKey: `release:${order.idempotencyKey}`,
          movement: { stakeCents: toCents(order.requestedStake) },
          orderId: order.id,
        });
      }
      await this.transition(manager, order.id, order.version, {
        status: 'REJECTED',
        rejectionCode: code,
        statusReason: reason.slice(0, 255),
      });
      await this.rejectDecision(manager, order.decisionId, code);
    });
    return this.dataSource
      .getRepository(BetOrder)
      .findOneByOrFail({ id: orderId });
  }

  private async applyStop(stop: AutoStopRequest | null): Promise<void> {
    const pending = stop as {
      trigger: AutoStopTrigger;
      details: Record<string, string | number | null>;
    } | null;
    if (pending) await this.control.autoStop(pending.trigger, pending.details);
  }
}

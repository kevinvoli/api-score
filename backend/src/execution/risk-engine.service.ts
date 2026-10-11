import { HttpException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import { RiskPolicy } from '../database/entities/risk-policy.entity';
import {
  ExecutionBlockedError,
  ExecutionControlService,
} from './execution-control.service';
import {
  AutoStopTrigger,
  DecimalString,
  RejectionCode,
  RiskLimit,
  toCents,
} from './execution.types';
import { LedgerRuleError, LedgerService } from './ledger.service';

export interface RiskInput {
  policy: Pick<
    RiskPolicy,
    | 'maxStakePerBet'
    | 'maxDailyStake'
    | 'maxDailyLoss'
    | 'maxOpenExposure'
    | 'maxQuoteAgeMs'
  >;
  stakeCents: number;
  availableCents: number;
  reservedCents: number;
  dailyStakedCents: number;
  dailySettledPnlCents: number;
  /** Âge de la cote au moment de la réservation (négatif = cote datée du futur). */
  quoteAgeMs: number;
}

export type RiskVerdict =
  | { ok: true }
  | {
      ok: false;
      code: RejectionCode;
      limit: RiskLimit;
      /** Cause d'arrêt automatique à déclencher, le cas échéant. */
      autoStop: AutoStopTrigger | null;
    };

/**
 * Plafonds d'une réservation, en centimes. Une limite exactement atteinte est permise,
 * un dépassement d'un centime est refusé. Arrêtent l'exécution : cote périmée ou datée du
 * futur, perte du jour atteinte, budget du jour épuisé. Les autres refus sont transitoires.
 */
export function evaluateRisk(input: RiskInput): RiskVerdict {
  const { policy } = input;
  const reject = (
    code: RejectionCode,
    limit: RiskLimit,
    autoStop: AutoStopTrigger | null = null,
  ): RiskVerdict => ({ ok: false, code, limit, autoStop });

  if (
    !Number.isFinite(input.quoteAgeMs) ||
    input.quoteAgeMs < 0 ||
    input.quoteAgeMs > policy.maxQuoteAgeMs
  ) {
    return reject('STALE_ODD', 'QUOTE_AGE', 'STALE_OR_SUSPENDED_ODD');
  }
  if (
    !(input.stakeCents > 0) ||
    input.stakeCents > toCents(policy.maxStakePerBet)
  ) {
    return reject('LIMIT_EXCEEDED', 'MAX_STAKE_PER_BET');
  }
  const dailyLossCents = Math.max(0, -input.dailySettledPnlCents);
  if (dailyLossCents >= toCents(policy.maxDailyLoss)) {
    return reject('LIMIT_EXCEEDED', 'DAILY_LOSS', 'DAILY_LIMIT_REACHED');
  }
  const maxDailyStakeCents = toCents(policy.maxDailyStake);
  if (input.dailyStakedCents + input.stakeCents > maxDailyStakeCents) {
    return reject(
      'LIMIT_EXCEEDED',
      'DAILY_STAKE',
      input.dailyStakedCents >= maxDailyStakeCents
        ? 'DAILY_LIMIT_REACHED'
        : null,
    );
  }
  if (
    input.reservedCents + input.stakeCents >
    toCents(policy.maxOpenExposure)
  ) {
    return reject('LIMIT_EXCEEDED', 'OPEN_EXPOSURE');
  }
  if (input.stakeCents > input.availableCents) {
    return reject('LIMIT_EXCEEDED', 'AVAILABLE_BALANCE');
  }
  return { ok: true };
}

/**
 * READ COMMITTED, jamais REPEATABLE READ : en REPEATABLE READ, la vue de la transaction est
 * figée à sa première lecture simple — ici avant le verrou du compte — et le budget du jour
 * serait calculé sur un instantané périmé, ignorant les réservations validées entre-temps.
 * Démontré par le test d'intégration « 20 réservations concurrentes » (20 acceptées sur 5).
 */
export const LEDGER_ISOLATION = 'READ COMMITTED' as const;

export function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export interface AutoStopRequest {
  trigger: AutoStopTrigger;
  details: Record<string, string | number | null>;
}

export interface ReserveStakeRequest {
  accountId: string;
  /** Clé d'idempotence de l'écriture (même clé = même réservation, jamais deux). */
  entryKey: string;
  stake: DecimalString;
  quoteCapturedAt: Date;
  orderId?: string | null;
  actorUserId?: string | null;
}

export type ReservationResult =
  | { status: 'RESERVED'; entry: BankrollLedgerEntry; replayed: boolean }
  | {
      status: 'REJECTED';
      code: RejectionCode;
      limit: RiskLimit | null;
      reason: string;
    };

@Injectable()
export class RiskEngineService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly control: ExecutionControlService,
    private readonly ledger: LedgerService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * Réserve une mise. Ordre des verrous : contrôle (partagé) puis compte (exclusif), dans
   * une seule transaction. Toute erreur — base, contrôle, politique, compte — refuse la
   * réservation ; les causes graves arrêtent l'exécution après la transaction.
   */
  async reserveStake(request: ReserveStakeRequest): Promise<ReservationResult> {
    let autoStop: AutoStopRequest | null = null;
    let result: ReservationResult;

    try {
      result = await this.dataSource.transaction(LEDGER_ISOLATION, (manager) =>
        this.reserveWithin(manager, request, (stop) => {
          autoStop = stop;
        }),
      );
    } catch (error) {
      const classified = this.classifyReservationError(
        error,
        request.entryKey,
        autoStop,
      );
      result = classified.result;
      autoStop = classified.autoStop;
    }

    const stop = autoStop as typeof autoStop;
    if (stop) {
      await this.control.autoStop(stop.trigger, stop.details);
    }
    return result;
  }

  /**
   * Corps d'une réservation, dans la transaction de l'appelant (READ COMMITTED requis) :
   * permet au pipeline d'ordre de créer l'ordre et de réserver la mise atomiquement.
   * Lève `ExecutionBlockedError` si le contrôle interdit l'exécution.
   */
  async reserveWithin(
    manager: EntityManager,
    request: ReserveStakeRequest,
    onAutoStop: (stop: AutoStopRequest) => void,
  ): Promise<ReservationResult> {
    const control = await this.control.lockForExecution(manager);

    const existing = await this.ledger.findEntry(manager, request.entryKey);
    if (existing) {
      // Rejeu : la réservation a déjà eu lieu, on renvoie le même résultat sans recontrôler les plafonds.
      const account = await this.ledger.lockAccount(manager, request.accountId);
      const replay = await this.ledger.append(manager, account, {
        type: 'RESERVE',
        entryKey: request.entryKey,
        movement: { stakeCents: toCents(request.stake) },
      });
      return {
        status: 'RESERVED',
        entry: replay.entry,
        replayed: true,
      } as const;
    }

    try {
      await this.control.assertClockWithinTolerance(manager);
    } catch (error) {
      onAutoStop({ trigger: 'CLOCK_OUT_OF_TOLERANCE', details: {} });
      throw error;
    }

    const policy = control.activeRiskPolicyId
      ? await manager
          .getRepository(RiskPolicy)
          .findOneBy({ id: control.activeRiskPolicyId })
      : null;
    if (!policy) {
      onAutoStop({
        trigger: 'CONTROL_UNREADABLE',
        details: { cause: 'politique active absente' },
      });
      return this.rejected(
        'RISK_CHECK_FAILED',
        null,
        'Aucune politique de risque active',
      );
    }

    const account = await this.ledger.lockAccount(manager, request.accountId);
    if (account.mode !== control.mode || account.currency !== policy.currency) {
      return this.rejected(
        'RISK_CHECK_FAILED',
        null,
        `Compte ${account.mode}/${account.currency} incompatible avec ${control.mode}/${policy.currency}`,
      );
    }

    const now = new Date();
    const daily = await this.ledger.dailyAggregates(
      manager,
      account.id,
      utcDayStart(now),
    );
    const verdict = evaluateRisk({
      policy,
      stakeCents: toCents(request.stake),
      availableCents: toCents(account.availableBalance),
      reservedCents: toCents(account.reservedBalance),
      dailyStakedCents: daily.stakedCents,
      dailySettledPnlCents: daily.settledPnlCents,
      quoteAgeMs: now.getTime() - request.quoteCapturedAt.getTime(),
    });
    if (verdict.ok === false) {
      if (verdict.autoStop) {
        onAutoStop({
          trigger: verdict.autoStop,
          details: { limit: verdict.limit },
        });
      }
      return this.rejected(
        verdict.code,
        verdict.limit,
        `Limite ${verdict.limit}`,
      );
    }

    const appended = await this.ledger.append(manager, account, {
      type: 'RESERVE',
      entryKey: request.entryKey,
      movement: { stakeCents: toCents(request.stake) },
      orderId: request.orderId ?? null,
      actorUserId: request.actorUserId ?? null,
    });
    return {
      status: 'RESERVED',
      entry: appended.entry,
      replayed: appended.replayed,
    } as const;
  }

  /** Traduit une erreur de réservation en refus, et en arrêt automatique si elle est grave. */
  classifyReservationError(
    error: unknown,
    entryKey: string,
    pending: AutoStopRequest | null,
  ): { result: ReservationResult; autoStop: AutoStopRequest | null } {
    let autoStop = pending;
    let result: ReservationResult;
    if (error instanceof ExecutionBlockedError) {
      if (error.unreadable) {
        autoStop = { trigger: 'CONTROL_UNREADABLE', details: {} };
      }
      result = this.rejected('CONTROL_DISABLED', null, error.message);
    } else if (error instanceof LedgerRuleError) {
      result = this.rejected(
        'RISK_CHECK_FAILED',
        'AVAILABLE_BALANCE',
        error.message,
      );
    } else if (error instanceof HttpException && !autoStop) {
      // Erreur de l'appelant (compte inconnu, clé réutilisée pour un autre montant) :
      // refus sans arrêt global.
      result = this.rejected('RISK_CHECK_FAILED', null, error.message);
    } else {
      // Base indisponible, deadlock, contrainte violée… : jamais d'engagement en cas de doute.
      this.logger.error(
        { event: 'reservation_failed', entryKey: entryKey },
        error instanceof Error ? error.stack : undefined,
        'RiskEngineService',
      );
      autoStop ??= {
        trigger: 'CONTROL_UNREADABLE',
        details: { cause: 'erreur base' },
      };
      result = this.rejected(
        'RISK_CHECK_FAILED',
        null,
        error instanceof Error ? error.message : String(error),
      );
    }

    return { result, autoStop };
  }

  /**
   * Relâche une mise réservée (ordre refusé, annulé). Permis même exécution arrêtée :
   * l'arrêt ne doit jamais empêcher de dénouer une exposition.
   */
  async releaseStake(input: {
    accountId: string;
    entryKey: string;
    stake: DecimalString;
    orderId?: string | null;
  }): Promise<BankrollLedgerEntry> {
    return this.dataSource.transaction(LEDGER_ISOLATION, async (manager) => {
      const account = await this.ledger.lockAccount(manager, input.accountId);
      const { entry } = await this.ledger.append(manager, account, {
        type: 'RELEASE',
        entryKey: input.entryKey,
        movement: { stakeCents: toCents(input.stake) },
        orderId: input.orderId ?? null,
      });
      return entry;
    });
  }

  /**
   * Règle une mise : `payout` = mise × cote si gagné, mise si VOID, 0 si perdu. Permis
   * exécution arrêtée. Atteindre la perte maximale du jour arrête l'exécution.
   */
  async settleStake(input: {
    accountId: string;
    entryKey: string;
    stake: DecimalString;
    payout: DecimalString;
    orderId?: string | null;
  }): Promise<BankrollLedgerEntry> {
    const { entry, lossReached } = await this.dataSource.transaction(
      LEDGER_ISOLATION,
      async (manager) => {
        const account = await this.ledger.lockAccount(manager, input.accountId);
        const appended = await this.ledger.append(manager, account, {
          type: 'SETTLE',
          entryKey: input.entryKey,
          movement: {
            stakeCents: toCents(input.stake),
            payoutCents: toCents(input.payout),
          },
          orderId: input.orderId ?? null,
        });
        const control = await this.control.readControl();
        const policy = await this.control.activePolicy(
          control.activeRiskPolicyId,
        );
        const daily = await this.ledger.dailyAggregates(
          manager,
          account.id,
          utcDayStart(new Date()),
        );
        return {
          entry: appended.entry,
          lossReached:
            policy !== null &&
            Math.max(0, -daily.settledPnlCents) >= toCents(policy.maxDailyLoss),
        };
      },
    );
    if (lossReached) {
      await this.control.autoStop('DAILY_LIMIT_REACHED', {
        limit: 'DAILY_LOSS',
      });
    }
    return entry;
  }

  /** Vérifie l'invariant d'un compte ; une divergence arrête l'exécution. */
  async checkLedgerInvariant(accountId: string): Promise<boolean> {
    const report = await this.ledger.verifyInvariant(accountId);
    if (!report.ok) {
      await this.control.autoStop('LEDGER_INVARIANT_BROKEN', { accountId });
    }
    return report.ok;
  }

  private rejected(
    code: RejectionCode,
    limit: RiskLimit | null,
    reason: string,
  ): ReservationResult {
    return { status: 'REJECTED', code, limit, reason };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import { BetOrder } from '../database/entities/bet-order.entity';
import { BetReceipt } from '../database/entities/bet-receipt.entity';
import { ReconciliationItem } from '../database/entities/reconciliation-item.entity';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { redactErrorMessage } from './adapters/operator-receipt-redactor';
import { ExecutionControlService } from './execution-control.service';
import {
  AutoStopTrigger,
  ReconciliationItemType,
  ReconciliationResult,
  ReconciliationSeverity,
  SUBMITTING_STALE_MS,
  toCents,
} from './execution.types';
import { OrderExecutionService } from './order-execution.service';
import type {
  OperatorOrder,
  OperatorOrderLookup,
  OperatorPort,
} from './operator.port';

export interface StartReconciliationInput {
  accountId: string;
  from: Date;
  to: Date;
  idempotencyKey?: string;
}

export type ItemDraft = Omit<
  ReconciliationItem,
  'id' | 'runId' | 'run' | 'order' | 'createdAt'
>;

export type OperatorLookupByKey = Map<string, OperatorOrderLookup>;

const OPEN_STATUSES = [
  'RESERVED',
  'SUBMITTING',
  'UNKNOWN',
  'ACCEPTED',
  'RECONCILIATION_REQUIRED',
] as const;

const LOOKUP_STATUSES = new Set([
  'UNKNOWN',
  'ACCEPTED',
  'SETTLED',
  'VOIDED',
  'REJECTED',
  'RECONCILIATION_REQUIRED',
]);

export async function lookupOperatorOrders(
  port: OperatorPort,
  keys: readonly string[],
): Promise<OperatorLookupByKey> {
  const uniqueKeys = [...new Set(keys)];
  if (!uniqueKeys.length) return new Map();
  try {
    const results = await port.getOrdersByIdempotencyKeys(uniqueKeys);
    const returned = new Map(
      results.map((result) => [result.idempotencyKey, result]),
    );
    return new Map(
      uniqueKeys.map((idempotencyKey) => [
        idempotencyKey,
        returned.get(idempotencyKey) ?? {
          idempotencyKey,
          status: 'LOOKUP_FAILED' as const,
          reason: 'Réponse opérateur incomplète',
        },
      ]),
    );
  } catch (error) {
    const reason = redactErrorMessage(error);
    return new Map(
      uniqueKeys.map((idempotencyKey) => [
        idempotencyKey,
        { idempotencyKey, status: 'LOOKUP_FAILED' as const, reason },
      ]),
    );
  }
}

function item(
  orderId: string | null,
  itemType: ReconciliationItemType,
  result: ReconciliationResult,
  severity: ReconciliationSeverity,
  detail: string,
  expected: Record<string, unknown> | null = null,
  observed: Record<string, unknown> | null = null,
): ItemDraft {
  return {
    orderId,
    itemType,
    result,
    severity,
    detail: detail.slice(0, 255),
    expected,
    observed,
  };
}

/** Vue minimale d'un ordre opérateur pour la preuve : jamais le reçu brut. */
const operatorView = (op: OperatorOrder | null) =>
  op
    ? {
        externalOrderId: op.externalOrderId,
        status: op.status,
        acceptedOdd: op.acceptedOdd,
        acceptedStake: op.acceptedStake,
        payout: op.payout,
      }
    : null;

/**
 * Comparaison pure d'un ordre local terminal ou accepté avec l'ordre opérateur et le ledger.
 * Les ordres ambigus (UNKNOWN) et les règlements sont traités par le service, qui écrit.
 */
export function compareOrder(
  order: BetOrder,
  operatorOrder: OperatorOrder | null,
  hasReceipt: boolean,
  ledgerKeys: Set<string>,
  operatorTracked: boolean,
): ItemDraft[] {
  const items: ItemDraft[] = [];
  const key = order.idempotencyKey;
  const reserved = ledgerKeys.has(`reserve:${key}`);
  const local = {
    status: order.status,
    externalOrderId: order.externalOrderId,
    acceptedStake: order.acceptedStake,
    acceptedOdd: order.acceptedOdd,
    payout: order.payout,
  };

  if (['ACCEPTED', 'SETTLED', 'VOIDED'].includes(order.status)) {
    if (!operatorOrder) {
      items.push(
        item(
          order.id,
          'ORDER',
          'MISSING_AT_OPERATOR',
          operatorTracked ? 'CRITICAL' : 'WARNING',
          operatorTracked
            ? 'Ordre accepté introuvable chez l’opérateur'
            : 'Opérateur papier sans historique persistant',
          local,
          null,
        ),
      );
    } else if (
      operatorOrder.externalOrderId !== order.externalOrderId ||
      operatorOrder.acceptedStake !== order.acceptedStake ||
      operatorOrder.acceptedOdd !== order.acceptedOdd ||
      operatorOrder.status === 'REJECTED'
    ) {
      items.push(
        item(
          order.id,
          'ORDER',
          'MISMATCH',
          'CRITICAL',
          'Ordre différent chez l’opérateur',
          local,
          operatorView(operatorOrder),
        ),
      );
    } else {
      items.push(
        item(
          order.id,
          'ORDER',
          'MATCH',
          'INFO',
          'Ordre concordant',
          null,
          null,
        ),
      );
    }
    if (!hasReceipt) {
      items.push(
        item(
          order.id,
          'RECEIPT',
          'MISSING_LOCALLY',
          'CRITICAL',
          'Acceptation sans reçu',
        ),
      );
    }
    if (!reserved) {
      items.push(
        item(
          order.id,
          'LEDGER',
          'MISSING_LOCALLY',
          'CRITICAL',
          'Acceptation sans réservation au ledger',
        ),
      );
    }
    if (order.status !== 'ACCEPTED') {
      if (!ledgerKeys.has(`settle:${key}`)) {
        items.push(
          item(
            order.id,
            'LEDGER',
            'MISSING_LOCALLY',
            'CRITICAL',
            'Ordre réglé sans écriture de règlement',
          ),
        );
      }
      if (operatorOrder && operatorOrder.payout !== order.payout) {
        items.push(
          item(
            order.id,
            'SETTLEMENT',
            'MISMATCH',
            'CRITICAL',
            'Gain réglé différent',
            local,
            operatorView(operatorOrder),
          ),
        );
      }
    }
  }

  if (order.status === 'REJECTED') {
    if (operatorOrder && operatorOrder.status !== 'REJECTED') {
      items.push(
        item(
          order.id,
          'ORDER',
          'MISMATCH',
          'CRITICAL',
          'Ordre refusé localement mais présent chez l’opérateur',
          local,
          operatorView(operatorOrder),
        ),
      );
    }
    if (reserved && !ledgerKeys.has(`release:${key}`)) {
      items.push(
        item(
          order.id,
          'LEDGER',
          'MISSING_LOCALLY',
          'CRITICAL',
          'Ordre refusé dont la mise n’a pas été relâchée',
        ),
      );
    }
  }

  if (order.status === 'RECONCILIATION_REQUIRED') {
    items.push(
      item(
        order.id,
        'ORDER',
        'MISMATCH',
        'CRITICAL',
        order.statusReason ?? 'Intervention manuelle requise',
        local,
        operatorView(operatorOrder),
      ),
    );
  }
  return items;
}

/** Choix de la cause d'arrêt la plus précise parmi les écarts critiques. */
export function stopTriggerFor(items: ItemDraft[]): AutoStopTrigger | null {
  const critical = items.filter((i) => i.severity === 'CRITICAL');
  if (!critical.length) return null;
  if (critical.some((i) => i.detail.includes('LOOKUP_FAILED')))
    return 'OPERATOR_ERROR_RATE';
  if (critical.some((i) => i.itemType === 'BALANCE'))
    return 'OPERATOR_BALANCE_MISMATCH';
  if (critical.some((i) => i.itemType === 'RECEIPT')) return 'RECEIPT_MISSING';
  if (critical.some((i) => i.itemType === 'LEDGER'))
    return 'LEDGER_INVARIANT_BROKEN';
  if (critical.some((i) => i.detail.includes('UNKNOWN')))
    return 'UNKNOWN_ORDER_TOO_OLD';
  return 'OPERATOR_CONTRACT_VIOLATION';
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderExecutionService,
    private readonly control: ExecutionControlService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * Crée un run idempotent : même clé (fournie, ou dérivée du compte et de la plage) → même run.
   * `execute` vaut true seulement pour l'appelant qui l'a réellement créé.
   */
  async open(
    input: StartReconciliationInput,
    requestedByUserId: string | null,
  ): Promise<{ run: ReconciliationRun; created: boolean }> {
    const idempotencyKey =
      input.idempotencyKey ??
      `${input.accountId}:${input.from.toISOString()}:${input.to.toISOString()}`;
    const repo = this.dataSource.getRepository(ReconciliationRun);
    const account = await this.dataSource
      .getRepository(BankrollAccount)
      .findOneBy({ id: input.accountId });
    if (!account)
      throw new NotFoundException(`Compte ${input.accountId} introuvable`);
    const inserted = await repo
      .createQueryBuilder()
      .insert()
      .into(ReconciliationRun)
      .values({
        idempotencyKey,
        accountId: input.accountId,
        rangeFrom: input.from,
        rangeTo: input.to,
        status: 'RUNNING',
        criticalCount: 0,
        summary: null,
        error: null,
        requestedByUserId,
        completedAt: null,
      })
      .orIgnore()
      .execute();
    const run = await repo.findOneByOrFail({ idempotencyKey });
    return {
      run,
      created: (inserted.raw as { affectedRows?: number })?.affectedRows === 1,
    };
  }

  async openBatch(
    inputs: readonly StartReconciliationInput[],
    requestedByUserId: string | null,
  ): Promise<{ runs: ReconciliationRun[]; createdRunIds: string[] }> {
    if (!inputs.length) return { runs: [], createdRunIds: [] };
    const accountIds = [...new Set(inputs.map((input) => input.accountId))];
    const accounts = await this.dataSource
      .getRepository(BankrollAccount)
      .findBy({ id: In(accountIds) });
    const found = new Set(accounts.map((account) => account.id));
    const missing = accountIds.find((accountId) => !found.has(accountId));
    if (missing) throw new NotFoundException(`Compte ${missing} introuvable`);

    const values = inputs.map((input) => ({
      idempotencyKey:
        input.idempotencyKey ??
        `${input.accountId}:${input.from.toISOString()}:${input.to.toISOString()}`,
      accountId: input.accountId,
      rangeFrom: input.from,
      rangeTo: input.to,
      status: 'RUNNING' as const,
      criticalCount: 0,
      summary: null,
      error: null,
      requestedByUserId,
      completedAt: null,
    }));
    const keys = values.map((value) => value.idempotencyKey);
    const repo = this.dataSource.getRepository(ReconciliationRun);
    const existing = await repo.findBy({ idempotencyKey: In(keys) });
    const existingKeys = new Set(existing.map((run) => run.idempotencyKey));
    await repo
      .createQueryBuilder()
      .insert()
      .into(ReconciliationRun)
      .values(values)
      .orIgnore()
      .execute();
    const runs = await repo.findBy({ idempotencyKey: In(keys) });
    return {
      runs,
      createdRunIds: runs
        .filter((run) => !existingKeys.has(run.idempotencyKey))
        .map((run) => run.id),
    };
  }

  async executeBatch(
    runIds: readonly string[],
    now: Date = new Date(),
  ): Promise<ReconciliationRun[]> {
    return Promise.all(
      [...new Set(runIds)].map((runId) => this.execute(runId, now)),
    );
  }

  /** Lance un run en arrière-plan (route 202). */
  async start(
    input: StartReconciliationInput,
    requestedByUserId: string | null,
  ): Promise<{ runId: string }> {
    const { run, created } = await this.open(input, requestedByUserId);
    if (created) {
      setImmediate(() => {
        this.execute(run.id).catch(() => undefined);
      });
    }
    return { runId: run.id };
  }

  /** Exécute un run : lectures groupées (ordres, reçus, ledger), résolutions, comparaisons, solde. */
  async execute(
    runId: string,
    now: Date = new Date(),
  ): Promise<ReconciliationRun> {
    const runs = this.dataSource.getRepository(ReconciliationRun);
    const run = await runs.findOneByOrFail({ id: runId });
    if (run.status !== 'RUNNING') return run;
    try {
      const account = await this.dataSource
        .getRepository(BankrollAccount)
        .findOneByOrFail({ id: run.accountId });
      const port = this.orders.portFor(account.mode);
      const operatorTracked = port.kind !== 'PAPER';
      const drafts: ItemDraft[] = [];
      const resolutions: Record<string, number> = {};

      await this.orders.recoverStaleSubmissions(now);
      await this.cancelAbandonedReservations(account.id, now, drafts);

      // Lecture 1 : ordres de la plage, plus tous les ordres encore ouverts du compte.
      const orderRows = await this.dataSource
        .getRepository(BetOrder)
        .createQueryBuilder('o')
        .where('o.accountId = :accountId', { accountId: account.id })
        .andWhere(
          '((o.createdAt >= :from AND o.createdAt < :to) OR o.status IN (:...open))',
          { from: run.rangeFrom, to: run.rangeTo, open: [...OPEN_STATUSES] },
        )
        .orderBy('o.createdAt', 'ASC')
        .addOrderBy('o.id', 'ASC')
        .getMany();

      const operatorLookups = await lookupOperatorOrders(
        port,
        orderRows
          .filter((order) => LOOKUP_STATUSES.has(order.status))
          .map((order) => order.idempotencyKey),
      );
      for (const order of orderRows.filter((row) =>
        LOOKUP_STATUSES.has(row.status),
      )) {
        const lookup = operatorLookups.get(order.idempotencyKey);
        if (!lookup || lookup.status === 'LOOKUP_FAILED') {
          const reason =
            lookup?.status === 'LOOKUP_FAILED'
              ? lookup.reason
              : 'Résultat absent';
          drafts.push(
            item(
              order.id,
              'ORDER',
              'PENDING',
              'CRITICAL',
              `LOOKUP_FAILED : ${reason}`,
            ),
          );
        }
      }

      // Résolution des ambiguïtés et règlements : une lecture groupée, toujours avec la même clé.
      for (const order of orderRows) {
        if (order.status !== 'UNKNOWN' && order.status !== 'ACCEPTED') continue;
        const lookup = operatorLookups.get(order.idempotencyKey);
        if (!lookup || lookup.status === 'LOOKUP_FAILED') {
          continue;
        }
        const operatorOrder = lookup.status === 'FOUND' ? lookup.order : null;
        if (order.status === 'UNKNOWN') {
          const resolution = await this.orders.resolveUnknown(
            order,
            operatorOrder,
            now,
          );
          resolutions[resolution] = (resolutions[resolution] ?? 0) + 1;
          drafts.push(
            item(
              order.id,
              'ORDER',
              resolution === 'PENDING'
                ? 'PENDING'
                : resolution === 'TOO_OLD' ||
                    resolution === 'RECONCILIATION_REQUIRED'
                  ? 'MISMATCH'
                  : 'RESOLVED',
              resolution === 'TOO_OLD' ||
                resolution === 'RECONCILIATION_REQUIRED'
                ? 'CRITICAL'
                : resolution === 'PENDING'
                  ? 'WARNING'
                  : 'INFO',
              `UNKNOWN → ${resolution}`,
              null,
              operatorView(operatorOrder),
            ),
          );
        } else if (
          operatorOrder &&
          (operatorOrder.status === 'SETTLED' ||
            operatorOrder.status === 'VOIDED')
        ) {
          await this.orders.settleFromOperator(order.id, operatorOrder);
          drafts.push(
            item(
              order.id,
              'SETTLEMENT',
              'RESOLVED',
              'INFO',
              `Règlement opérateur ${operatorOrder.status}`,
              null,
              operatorView(operatorOrder),
            ),
          );
        }
      }

      // Lectures 2-4 : état à jour des ordres, reçus et écritures, en lot.
      const ids = orderRows.map((o) => o.id);
      const [fresh, receipts, entries] = ids.length
        ? await Promise.all([
            this.dataSource.getRepository(BetOrder).findBy({ id: In(ids) }),
            this.dataSource
              .getRepository(BetReceipt)
              .find({ where: { orderId: In(ids) }, select: { orderId: true } }),
            this.dataSource.getRepository(BankrollLedgerEntry).find({
              where: { accountId: account.id, orderId: In(ids) },
              select: { entryKey: true },
            }),
          ])
        : [[], [], []];
      const withReceipt = new Set(receipts.map((r) => r.orderId));
      const ledgerKeys = new Set(entries.map((e) => e.entryKey));

      for (const order of fresh) {
        if (order.status === 'UNKNOWN') continue;
        const shouldLookup = [
          'ACCEPTED',
          'SETTLED',
          'VOIDED',
          'REJECTED',
          'RECONCILIATION_REQUIRED',
        ].includes(order.status);
        const lookup = shouldLookup
          ? operatorLookups.get(order.idempotencyKey)
          : undefined;
        if (lookup?.status === 'LOOKUP_FAILED') continue;
        const operatorOrder = lookup?.status === 'FOUND' ? lookup.order : null;
        drafts.push(
          ...compareOrder(
            order,
            operatorOrder,
            withReceipt.has(order.id),
            ledgerKeys,
            operatorTracked,
          ),
        );
      }

      // Solde : compte local contre opérateur (disponible et exposition).
      const freshAccount = await this.dataSource
        .getRepository(BankrollAccount)
        .findOneByOrFail({ id: account.id });
      // Ordre ambigu ou pas encore soumis : l'écart de solde est attendu, pas une anomalie.
      const ambiguous = fresh.filter((o) =>
        ['RESERVED', 'SUBMITTING', 'UNKNOWN'].includes(o.status),
      ).length;
      if (operatorTracked && ambiguous > 0) {
        drafts.push(
          item(
            null,
            'BALANCE',
            'PENDING',
            'WARNING',
            `Solde non comparable : ${ambiguous} ordre(s) en attente de résolution`,
          ),
        );
      } else if (operatorTracked) {
        try {
          const balance = await port.getBalance(freshAccount.currency);
          const expected = {
            available: freshAccount.availableBalance,
            exposure: freshAccount.reservedBalance,
          };
          const observed = {
            available: balance.available,
            exposure: balance.exposure,
          };
          const same =
            balance.currency === freshAccount.currency &&
            toCents(balance.available) ===
              toCents(freshAccount.availableBalance) &&
            toCents(balance.exposure) === toCents(freshAccount.reservedBalance);
          drafts.push(
            same
              ? item(
                  null,
                  'BALANCE',
                  'MATCH',
                  'INFO',
                  'Solde concordant',
                  expected,
                  observed,
                )
              : item(
                  null,
                  'BALANCE',
                  'MISMATCH',
                  'CRITICAL',
                  'Solde opérateur divergent',
                  expected,
                  observed,
                ),
          );
        } catch (error) {
          drafts.push(
            item(
              null,
              'BALANCE',
              'PENDING',
              'CRITICAL',
              `Solde opérateur illisible : ${redactErrorMessage(error)}`,
            ),
          );
        }
      }

      const invariant = await this.dataSourceInvariant(freshAccount.id);
      if (!invariant) {
        drafts.push(
          item(
            null,
            'LEDGER',
            'MISMATCH',
            'CRITICAL',
            'Invariant du ledger rompu',
          ),
        );
      }

      const criticalCount = drafts.filter(
        (d) => d.severity === 'CRITICAL',
      ).length;
      const summary = {
        orders: orderRows.length,
        resolutions,
        byResult: drafts.reduce<Record<string, number>>((acc, d) => {
          acc[d.result] = (acc[d.result] ?? 0) + 1;
          return acc;
        }, {}),
        criticalCount,
      };
      await this.dataSource.transaction(async (manager) => {
        if (drafts.length) {
          await manager
            .getRepository(ReconciliationItem)
            .insert(drafts.map((d) => ({ ...d, runId })));
        }
        await manager.getRepository(ReconciliationRun).update(
          { id: runId, status: 'RUNNING' },
          {
            status: 'COMPLETED',
            criticalCount,
            summary,
            completedAt: new Date(),
          },
        );
      });

      const trigger = stopTriggerFor(drafts);
      if (trigger)
        await this.control.autoStop(trigger, { reconciliationRunId: runId });
      this.logger.log(
        { event: 'reconciliation_completed', runId, criticalCount },
        'ReconciliationService',
      );
    } catch (error) {
      await runs.update(
        { id: runId, status: 'RUNNING' },
        {
          status: 'FAILED',
          error: redactErrorMessage(error),
          completedAt: new Date(),
        },
      );
      await this.control.autoStop('RECONCILIATION_LATE', {
        reconciliationRunId: runId,
        cause: 'échec',
      });
      this.logger.error(
        { event: 'reconciliation_failed', runId },
        error instanceof Error ? error.stack : undefined,
        'ReconciliationService',
      );
    }
    return runs.findOneByOrFail({ id: runId });
  }

  async getRun(
    runId: string,
  ): Promise<ReconciliationRun & { items: ReconciliationItem[] }> {
    const run = await this.dataSource
      .getRepository(ReconciliationRun)
      .findOneBy({ id: runId });
    if (!run)
      throw new NotFoundException(`Réconciliation ${runId} introuvable`);
    const items = await this.dataSource.getRepository(ReconciliationItem).find({
      where: { runId },
      order: { severity: 'ASC', createdAt: 'ASC' },
    });
    return Object.assign(run, { items });
  }

  /** Une réservation jamais soumise (crash avant l'appel) est relâchée : l'opérateur n'a rien reçu. */
  private async cancelAbandonedReservations(
    accountId: string,
    now: Date,
    drafts: ItemDraft[],
  ): Promise<void> {
    const stale = await this.dataSource.getRepository(BetOrder).find({
      where: { accountId, status: 'RESERVED' },
    });
    const abandoned = stale.filter(
      (o) => now.getTime() - o.updatedAt.getTime() >= SUBMITTING_STALE_MS,
    );
    if (!abandoned.length) return;
    const cancelledIds = await this.orders.cancelAbandonedBatch(
      abandoned.map((order) => order.id),
    );
    drafts.push(
      ...cancelledIds.map((orderId) =>
        item(
          orderId,
          'ORDER',
          'RESOLVED',
          'WARNING',
          'Réservation jamais soumise relâchée',
        ),
      ),
    );
  }

  private async dataSourceInvariant(accountId: string): Promise<boolean> {
    return this.orders.ledgerInvariantOk(accountId);
  }
}

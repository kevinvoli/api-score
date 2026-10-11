import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { ExecutionControlService } from './execution-control.service';
import { ReconciliationService } from './reconciliation.service';

export const RECONCILIATION_INTERVAL_NAME = 'execution-reconciliation';
export const RECONCILIATION_LOCK = 'api_score_reconciliation';
const DEFAULT_INTERVAL_MS = 300_000;
const MIN_INTERVAL_MS = 60_000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Réconciliation « en retard » au-delà de trois intervalles sans run complété. */
const LATE_FACTOR = 3;

export type TickOutcome =
  | 'SKIPPED_LOCAL'
  | 'SKIPPED_LOCKED'
  | 'DONE'
  | 'FAILED';

/**
 * Réconciliation périodique, désactivée par défaut (`RECONCILIATION_SCHEDULER_ENABLED=true`).
 * Double scheduler (deux instances, tick en retard) : verrou nommé MySQL `GET_LOCK`, tenu
 * sur une connexion dédiée ; en plus, la clé de run par créneau rend tout rejeu inoffensif.
 */
@Injectable()
export class ReconciliationScheduler implements OnModuleInit, OnModuleDestroy {
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly dataSource: DataSource,
    private readonly reconciliation: ReconciliationService,
    private readonly control: ExecutionControlService,
    private readonly logger: JsonLogger,
  ) {}

  intervalMs(): number {
    const raw = Number(
      this.config.get<string>('RECONCILIATION_INTERVAL_MS') ??
        DEFAULT_INTERVAL_MS,
    );
    return Number.isInteger(raw)
      ? Math.max(raw, MIN_INTERVAL_MS)
      : DEFAULT_INTERVAL_MS;
  }

  onModuleInit(): void {
    if (
      this.config.get<string>('RECONCILIATION_SCHEDULER_ENABLED') !== 'true'
    ) {
      this.logger.log(
        { event: 'reconciliation_scheduler_disabled' },
        'ReconciliationScheduler',
      );
      return;
    }
    const ref = setInterval(() => {
      void this.runTick().catch((error: unknown) => {
        this.logger.error(
          { event: 'reconciliation_tick_unhandled' },
          error instanceof Error ? error.stack : undefined,
          'ReconciliationScheduler',
        );
      });
    }, this.intervalMs());
    this.registry.addInterval(RECONCILIATION_INTERVAL_NAME, ref);
  }

  onModuleDestroy(): void {
    if (this.registry.doesExist('interval', RECONCILIATION_INTERVAL_NAME)) {
      this.registry.deleteInterval(RECONCILIATION_INTERVAL_NAME);
    }
  }

  async runTick(now: Date = new Date()): Promise<TickOutcome> {
    if (this.running) return 'SKIPPED_LOCAL';
    this.running = true;
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      const [{ acquired }] = (await runner.query(
        'SELECT GET_LOCK(?, 0) AS acquired',
        [RECONCILIATION_LOCK],
      )) as Array<{ acquired: number | string | null }>;
      if (Number(acquired) !== 1) return 'SKIPPED_LOCKED';
      locked = true;

      const interval = this.intervalMs();
      const bucket = Math.floor(now.getTime() / interval);
      const accounts = (await this.dataSource.query(
        `SELECT DISTINCT account_id AS accountId FROM bet_orders
          WHERE status IN ('RESERVED','SUBMITTING','UNKNOWN','ACCEPTED','RECONCILIATION_REQUIRED')
             OR created_at >= ?`,
        [new Date(now.getTime() - LOOKBACK_MS)],
      )) as Array<{ accountId: string }>;

      const { createdRunIds } = await this.reconciliation.openBatch(
        accounts.map(({ accountId }) => ({
          accountId,
          from: new Date(now.getTime() - LOOKBACK_MS),
          to: now,
          idempotencyKey: `auto:${accountId}:${bucket}`,
        })),
        null,
      );
      await this.reconciliation.executeBatch(createdRunIds, now);
      await this.checkLateness(
        accounts.map((a) => a.accountId),
        now,
        interval,
      );
      return 'DONE';
    } catch (error) {
      await this.control
        .autoStop('CONTROL_UNREADABLE', {
          source: 'reconciliation_scheduler',
        })
        .catch(() => false);
      this.logger.error(
        { event: 'reconciliation_tick_failed' },
        error instanceof Error ? error.stack : undefined,
        'ReconciliationScheduler',
      );
      return 'FAILED';
    } finally {
      if (locked)
        await runner
          .query('SELECT RELEASE_LOCK(?)', [RECONCILIATION_LOCK])
          .catch(() => undefined);
      await runner.release().catch(() => undefined);
      this.running = false;
    }
  }

  /** Exécution active et ordres ouverts sans run complété récent : arrêt RECONCILIATION_LATE. */
  private async checkLateness(
    accountIds: string[],
    now: Date,
    interval: number,
  ): Promise<void> {
    if (!accountIds.length) return;
    const snapshot = await this.control.readControl();
    if (snapshot.mode === 'DISABLED') return;
    const latest = (await this.dataSource
      .getRepository(ReconciliationRun)
      .createQueryBuilder('r')
      .select('r.accountId', 'accountId')
      .addSelect('MAX(r.completedAt)', 'lastCompletedAt')
      .where('r.status = :status', { status: 'COMPLETED' })
      .andWhere('r.accountId IN (:...ids)', { ids: accountIds })
      .groupBy('r.accountId')
      .getRawMany()) as Array<{
      accountId: string;
      lastCompletedAt: Date | string | null;
    }>;
    const byAccount = new Map(
      latest.map((r) => [r.accountId, r.lastCompletedAt]),
    );
    const late = accountIds.filter((id) => {
      const last = byAccount.get(id);
      return (
        !last ||
        now.getTime() - new Date(last).getTime() > LATE_FACTOR * interval
      );
    });
    if (late.length) {
      await this.control.autoStop('RECONCILIATION_LATE', {
        accounts: late.length,
      });
    }
  }
}

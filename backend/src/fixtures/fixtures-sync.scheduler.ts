import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { FixturesIngestionService } from './fixtures-ingestion.service';
import { SmartSuggestionsService } from '../recommendations/smart-suggestions.service';

type JobState = 'active' | 'paused';

@Injectable()
export class FixturesSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly intervalName = 'live-fixtures-sync';
  private isSyncRunning = false;
  private jobState: JobState = 'active';
  private consecutiveFailures = 0;
  private pausedUntil: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly fixturesIngestionService: FixturesIngestionService,
    private readonly smartSuggestionsService: SmartSuggestionsService,
    private readonly logger: JsonLogger,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>('LIVE_FIXTURES_SYNC_ENABLED') === 'true';
    if (!enabled) {
      this.logger.log(
        {
          event: 'fixtures_sync_scheduler_disabled',
        },
        'FixturesSyncScheduler',
      );
      return;
    }

    const intervalMs = this.configService.get<number>(
      'LIVE_FIXTURES_SYNC_INTERVAL_MS',
      30000,
    );

    const intervalRef = setInterval(() => {
      void this.runSyncTick();
    }, intervalMs);
    this.schedulerRegistry.addInterval(this.intervalName, intervalRef);

    this.logger.log(
      {
        event: 'fixtures_sync_scheduler_started',
        intervalMs,
      },
      'FixturesSyncScheduler',
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', this.intervalName)) {
      this.schedulerRegistry.deleteInterval(this.intervalName);
    }
  }

  async runSyncTick(): Promise<void> {
    if (this.isSyncRunning) {
      this.logger.warn(
        {
          event: 'fixtures_sync_skipped',
          reason: 'already_running',
        },
        'FixturesSyncScheduler',
      );
      return;
    }

    if (this.tryResume()) {
      return;
    }

    if (this.jobState === 'paused') {
      this.logger.warn(
        {
          event: 'job_state_paused',
          pausedUntil: this.pausedUntil,
          consecutiveFailures: this.consecutiveFailures,
        },
        'FixturesSyncScheduler',
      );
      return;
    }

    const quotaOk = await this.hasRateBudget();
    if (!quotaOk) {
      this.logger.warn(
        {
          event: 'job_state_throttled',
          reason: 'rate_limit_guard',
        },
        'FixturesSyncScheduler',
      );
      return;
    }

    this.isSyncRunning = true;
    try {
      await this.fixturesIngestionService.syncLiveFixtures();
      // Évaluer les règles métier immédiatement après chaque sync réussie
      void this.smartSuggestionsService.evaluateAndSave().catch((err: unknown) => {
        this.logger.warn(
          { event: 'smart_suggestions_eval_failed', error: String(err) },
          'FixturesSyncScheduler',
        );
      });
      this.onSyncSuccess();
    } catch (error) {
      this.logger.error(
        {
          event: 'fixtures_sync_failed',
          consecutiveFailures: this.consecutiveFailures + 1,
        },
        error instanceof Error ? error.stack : undefined,
        'FixturesSyncScheduler',
      );
      this.onSyncFailure();
    } finally {
      this.isSyncRunning = false;
    }
  }

  private onSyncSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
      this.logger.log(
        { event: 'job_state_active', reason: 'sync_succeeded_after_failures' },
        'FixturesSyncScheduler',
      );
    }
  }

  private onSyncFailure(): void {
    this.consecutiveFailures += 1;
    const maxFailures = this.configService.get<number>(
      'SCHEDULER_MAX_CONSECUTIVE_FAILURES',
      5,
    );
    const pauseDurationMs = this.configService.get<number>(
      'SCHEDULER_PAUSE_DURATION_MS',
      300_000,
    );

    if (this.consecutiveFailures >= maxFailures) {
      this.jobState = 'paused';
      this.pausedUntil = Date.now() + pauseDurationMs;
      this.logger.warn(
        {
          event: 'job_state_paused',
          consecutiveFailures: this.consecutiveFailures,
          pausedUntil: this.pausedUntil,
          pauseDurationMs,
        },
        'FixturesSyncScheduler',
      );
    }
  }

  private tryResume(): boolean {
    if (this.jobState !== 'paused' || this.pausedUntil === null) {
      return false;
    }

    if (Date.now() < this.pausedUntil) {
      return false;
    }

    this.jobState = 'active';
    this.consecutiveFailures = 0;
    this.pausedUntil = null;
    this.logger.log(
      { event: 'job_state_resumed' },
      'FixturesSyncScheduler',
    );
    return false;
  }

  private async hasRateBudget(): Promise<boolean> {
    const perMinuteLimit = this.configService.get<number>('RATE_LIMIT_PER_MIN', 300);
    const headroomPct = this.configService.get<number>(
      'SYNC_RATE_LIMIT_HEADROOM_PCT',
      90,
    );
    const budget = Math.floor((perMinuteLimit * headroomPct) / 100);
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const callsLastMinute = await this.apiUsageLogRepository.count({
      where: {
        calledAt: MoreThanOrEqual(oneMinuteAgo),
      },
    });

    return callsLastMinute < budget;
  }
}

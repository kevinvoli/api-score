import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { FixturesIngestionService } from './fixtures-ingestion.service';

@Injectable()
export class FixturesSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly intervalName = 'live-fixtures-sync';
  private isSyncRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly fixturesIngestionService: FixturesIngestionService,
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

    const quotaOk = await this.hasRateBudget();
    if (!quotaOk) {
      this.logger.warn(
        {
          event: 'fixtures_sync_skipped',
          reason: 'rate_limit_guard',
        },
        'FixturesSyncScheduler',
      );
      return;
    }

    this.isSyncRunning = true;
    try {
      await this.fixturesIngestionService.syncLiveFixtures();
    } catch (error) {
      this.logger.error(
        {
          event: 'fixtures_sync_failed',
        },
        error instanceof Error ? error.stack : undefined,
        'FixturesSyncScheduler',
      );
    } finally {
      this.isSyncRunning = false;
    }
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

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { OddsIngestionService } from './odds-ingestion.service';

type JobState = 'active' | 'paused';
type Phase = 'prematch' | 'live';

interface PhaseState {
  isSyncRunning: boolean;
  jobState: JobState;
  consecutiveFailures: number;
  pausedUntil: number | null;
}

@Injectable()
export class OddsSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly intervalNames: Record<Phase, string> = {
    prematch: 'odds-prematch-sync',
    live: 'odds-live-sync',
  };

  // État de circuit breaker distinct par cadence : un incident sur le flux
  // live ne doit pas mettre en pause la synchro prématch, et inversement.
  private readonly states: Record<Phase, PhaseState> = {
    prematch: this.initialState(),
    live: this.initialState(),
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly oddsIngestionService: OddsIngestionService,
    private readonly logger: JsonLogger,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>('ODDS_SYNC_ENABLED') === 'true';
    if (!enabled) {
      this.logger.log(
        { event: 'odds_sync_scheduler_disabled' },
        'OddsSyncScheduler',
      );
      return;
    }

    this.startInterval(
      'prematch',
      this.configService.get<number>('ODDS_PREMATCH_SYNC_INTERVAL_MS', 3600000),
    );
    this.startInterval(
      'live',
      this.configService.get<number>('ODDS_LIVE_SYNC_INTERVAL_MS', 120000),
    );
  }

  onModuleDestroy(): void {
    for (const phase of Object.keys(this.intervalNames) as Phase[]) {
      const name = this.intervalNames[phase];
      if (this.schedulerRegistry.doesExist('interval', name)) {
        this.schedulerRegistry.deleteInterval(name);
      }
    }
  }

  async runSyncTick(phase: Phase): Promise<void> {
    const state = this.states[phase];

    if (state.isSyncRunning) {
      this.logger.warn(
        { event: 'odds_sync_skipped', phase, reason: 'already_running' },
        'OddsSyncScheduler',
      );
      return;
    }

    if (this.tryResume(phase)) {
      return;
    }

    if (state.jobState === 'paused') {
      this.logger.warn(
        {
          event: 'job_state_paused',
          phase,
          pausedUntil: state.pausedUntil,
          consecutiveFailures: state.consecutiveFailures,
        },
        'OddsSyncScheduler',
      );
      return;
    }

    const quotaOk = await this.hasRateBudget();
    if (!quotaOk) {
      this.logger.warn(
        { event: 'job_state_throttled', phase, reason: 'rate_limit_guard' },
        'OddsSyncScheduler',
      );
      return;
    }

    state.isSyncRunning = true;
    try {
      if (phase === 'prematch') {
        await this.oddsIngestionService.syncPrematchOdds();
      } else {
        await this.oddsIngestionService.syncLiveOdds();
      }
      this.onSyncSuccess(phase);
    } catch (error) {
      this.logger.error(
        {
          event: 'odds_sync_failed',
          phase,
          consecutiveFailures: state.consecutiveFailures + 1,
        },
        error instanceof Error ? error.stack : undefined,
        'OddsSyncScheduler',
      );
      this.onSyncFailure(phase);
    } finally {
      state.isSyncRunning = false;
    }
  }

  private startInterval(phase: Phase, intervalMs: number): void {
    const intervalRef = setInterval(() => {
      void this.runSyncTick(phase);
    }, intervalMs);
    this.schedulerRegistry.addInterval(this.intervalNames[phase], intervalRef);

    this.logger.log(
      { event: 'odds_sync_scheduler_started', phase, intervalMs },
      'OddsSyncScheduler',
    );
  }

  private onSyncSuccess(phase: Phase): void {
    const state = this.states[phase];
    if (state.consecutiveFailures > 0) {
      state.consecutiveFailures = 0;
      this.logger.log(
        {
          event: 'job_state_active',
          phase,
          reason: 'sync_succeeded_after_failures',
        },
        'OddsSyncScheduler',
      );
    }
  }

  private onSyncFailure(phase: Phase): void {
    const state = this.states[phase];
    state.consecutiveFailures += 1;
    const maxFailures = this.configService.get<number>(
      'SCHEDULER_MAX_CONSECUTIVE_FAILURES',
      5,
    );
    const pauseDurationMs = this.configService.get<number>(
      'SCHEDULER_PAUSE_DURATION_MS',
      300_000,
    );

    if (state.consecutiveFailures >= maxFailures) {
      state.jobState = 'paused';
      state.pausedUntil = Date.now() + pauseDurationMs;
      this.logger.warn(
        {
          event: 'job_state_paused',
          phase,
          consecutiveFailures: state.consecutiveFailures,
          pausedUntil: state.pausedUntil,
          pauseDurationMs,
        },
        'OddsSyncScheduler',
      );
    }
  }

  private tryResume(phase: Phase): boolean {
    const state = this.states[phase];
    if (state.jobState !== 'paused' || state.pausedUntil === null) {
      return false;
    }

    if (Date.now() < state.pausedUntil) {
      return false;
    }

    state.jobState = 'active';
    state.consecutiveFailures = 0;
    state.pausedUntil = null;
    this.logger.log({ event: 'job_state_resumed', phase }, 'OddsSyncScheduler');
    return true;
  }

  private async hasRateBudget(): Promise<boolean> {
    const perMinuteLimit = this.configService.get<number>(
      'RATE_LIMIT_PER_MIN',
      300,
    );
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

  private initialState(): PhaseState {
    return {
      isSyncRunning: false,
      jobState: 'active',
      consecutiveFailures: 0,
      pausedUntil: null,
    };
  }
}

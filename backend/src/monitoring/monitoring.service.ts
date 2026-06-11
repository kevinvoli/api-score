import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';

const HEALTH_CHECK_TIMEOUT_MS = 1500;
const PROVIDER_RECENT_WINDOW_MS = 5 * 60 * 1000;

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'down';
  timestamp_utc: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      latency_ms: number | null;
    };
    providerApiFootball: {
      status: 'up' | 'down' | 'skipped';
      latency_ms: number | null;
    };
  };
}

export interface UsageMetrics {
  apiCallsLastHour: number;
  apiErrorsLastHour: number;
  lastProviderCallAt: string | null;
}

export interface PipelineAlert {
  type: 'HIGH_ERROR_RATE' | 'HIGH_TIMEOUT_RATE' | 'LOW_QUOTA';
  message: string;
  value: number;
  threshold: number;
}

export interface PipelineMetrics {
  window_minutes: number;
  totalCalls: number;
  errorRate5xx_pct: number;
  timeoutRate_pct: number;
  quotaRemainingMin: number | null;
  alerts: PipelineAlert[];
}

@Injectable()
export class MonitoringService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
    private readonly configService: ConfigService,
    private readonly logger: JsonLogger,
  ) {}

  async getHealth(): Promise<HealthCheckResult> {
    const timestamp_utc = new Date().toISOString();

    const dbCheck = await this.checkDatabase();
    const providerCheck = await this.checkProvider();

    let status: 'ok' | 'degraded' | 'down';
    if (dbCheck.status === 'down') {
      status = 'down';
    } else if (providerCheck.status === 'down') {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    return {
      status,
      timestamp_utc,
      uptime: Math.round(process.uptime()),
      checks: {
        database: dbCheck,
        providerApiFootball: providerCheck,
      },
    };
  }

  async getUsageMetrics(): Promise<UsageMetrics> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const apiCallsLastHour = await this.apiUsageLogRepository.count({
      where: {
        calledAt: MoreThanOrEqual(oneHourAgo),
      },
    });

    const apiErrorsLastHour = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .where('log.calledAt >= :oneHourAgo', { oneHourAgo })
      .andWhere('log.responseStatus >= :status', { status: 400 })
      .getCount();

    const lastProviderCall = await this.apiUsageLogRepository.findOne({
      order: { calledAt: 'DESC' },
      select: { calledAt: true },
    });

    return {
      apiCallsLastHour,
      apiErrorsLastHour,
      lastProviderCallAt: lastProviderCall?.calledAt?.toISOString() ?? null,
    };
  }

  async getPipelineMetrics(): Promise<PipelineMetrics> {
    const windowMs = 5 * 60 * 1000;
    const windowMinutes = 5;
    const since = new Date(Date.now() - windowMs);

    const logs = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select(['log.responseStatus', 'log.latencyMs', 'log.rateLimitRemaining'])
      .where('log.calledAt >= :since', { since })
      .getMany();

    const totalCalls = logs.length;

    const errors5xx = logs.filter((l) => l.responseStatus >= 500).length;
    const timeoutMs = this.configService.get<number>('REQUEST_TIMEOUT_MS', 30000);
    const timeouts = logs.filter((l) => l.latencyMs >= timeoutMs).length;

    const errorRate5xx_pct = totalCalls > 0 ? Math.round((errors5xx / totalCalls) * 100) : 0;
    const timeoutRate_pct = totalCalls > 0 ? Math.round((timeouts / totalCalls) * 100) : 0;

    const rateLimitValues = logs
      .map((l) => l.rateLimitRemaining)
      .filter((v): v is number => v !== null);
    const quotaRemainingMin = rateLimitValues.length > 0 ? Math.min(...rateLimitValues) : null;
    const rateLimitPerMin = this.configService.get<number>('RATE_LIMIT_PER_MIN', 300);

    const alertErrorRatePct = this.configService.get<number>('ALERT_ERROR_RATE_PCT', 20);
    const alertTimeoutRatePct = this.configService.get<number>('ALERT_TIMEOUT_RATE_PCT', 20);
    const alertQuotaMinPct = this.configService.get<number>('ALERT_QUOTA_REMAINING_MIN_PCT', 10);

    const alerts: PipelineAlert[] = [];

    if (totalCalls >= 5 && errorRate5xx_pct > alertErrorRatePct) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        message: `5xx error rate ${errorRate5xx_pct}% exceeds threshold ${alertErrorRatePct}% over last ${windowMinutes} min`,
        value: errorRate5xx_pct,
        threshold: alertErrorRatePct,
      });
    }

    if (totalCalls >= 5 && timeoutRate_pct > alertTimeoutRatePct) {
      alerts.push({
        type: 'HIGH_TIMEOUT_RATE',
        message: `Timeout rate ${timeoutRate_pct}% exceeds threshold ${alertTimeoutRatePct}% over last ${windowMinutes} min`,
        value: timeoutRate_pct,
        threshold: alertTimeoutRatePct,
      });
    }

    if (quotaRemainingMin !== null) {
      const quotaRemainingPct = Math.round((quotaRemainingMin / rateLimitPerMin) * 100);
      if (quotaRemainingPct < alertQuotaMinPct) {
        alerts.push({
          type: 'LOW_QUOTA',
          message: `Provider quota remaining ${quotaRemainingPct}% is below threshold ${alertQuotaMinPct}%`,
          value: quotaRemainingPct,
          threshold: alertQuotaMinPct,
        });
      }
    }

    if (alerts.length > 0) {
      this.notifyAlerts(alerts);
    }

    return {
      window_minutes: windowMinutes,
      totalCalls,
      errorRate5xx_pct,
      timeoutRate_pct,
      quotaRemainingMin,
      alerts,
    };
  }

  private notifyAlerts(alerts: PipelineAlert[]): void {
    const webhookUrl = this.configService.get<string>('SLACK_ALERT_WEBHOOK_URL');

    for (const alert of alerts) {
      this.logger.error(
        {
          alert: true,
          alertType: alert.type,
          value: alert.value,
          threshold: alert.threshold,
        },
        undefined,
        'MonitoringService',
      );

      if (webhookUrl) {
        const text = `[api-score] ALERT: ${alert.type} = ${alert.value} (seuil: ${alert.threshold})`;
        axios
          .post(webhookUrl, { text })
          .catch((err: unknown) => {
            this.logger.warn(
              {
                event: 'slack_alert_failed',
                alertType: alert.type,
                error: err instanceof Error ? err.message : String(err),
              },
              'MonitoringService',
            );
          });
      }
    }
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; latency_ms: number | null }> {
    const start = Date.now();
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        this.timeout(HEALTH_CHECK_TIMEOUT_MS),
      ]);
      return { status: 'up', latency_ms: Date.now() - start };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkProvider(): Promise<{
    status: 'up' | 'down' | 'skipped';
    latency_ms: number | null;
  }> {
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY');
    if (!apiKey) {
      return { status: 'skipped', latency_ms: null };
    }

    const since = new Date(Date.now() - PROVIDER_RECENT_WINDOW_MS);
    const lastLog = await this.apiUsageLogRepository.findOne({
      where: { calledAt: MoreThanOrEqual(since) },
      order: { calledAt: 'DESC' },
      select: { responseStatus: true, latencyMs: true },
    });

    if (!lastLog) {
      return { status: 'skipped', latency_ms: null };
    }

    const isUp = lastLog.responseStatus >= 200 && lastLog.responseStatus < 400;
    return {
      status: isUp ? 'up' : 'down',
      latency_ms: lastLog.latencyMs,
    };
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms),
    );
  }
}

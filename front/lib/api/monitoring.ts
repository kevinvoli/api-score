import { apiFetch } from './client';

export type HealthCheckResult = {
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
};

export type UsageMetrics = {
  apiCallsLastHour: number;
  apiErrorsLastHour: number;
  lastProviderCallAt: string | null;
};

export const fetchHealth = async (): Promise<HealthCheckResult> => {
  return apiFetch<HealthCheckResult>('/v1/health');
};

export const fetchUsageMetrics = async (): Promise<UsageMetrics> => {
  return apiFetch<UsageMetrics>('/v1/metrics/usage');
};

import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  const dataSourceMock = {
    query: jest.fn(),
  };

  const queryBuilderMock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getMany: jest.fn(),
  };

  const repositoryMock = {
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    findOne: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        API_FOOTBALL_KEY: 'test-key',
        REQUEST_TIMEOUT_MS: 30000,
        RATE_LIMIT_PER_MIN: 300,
        ALERT_ERROR_RATE_PCT: 20,
        ALERT_TIMEOUT_RATE_PCT: 20,
        ALERT_QUOTA_REMAINING_MIN_PCT: 10,
      };
      return values[key] ?? defaultValue;
    }),
  };

  const service = new MonitoringService(
    dataSourceMock as any,
    repositoryMock as any,
    configServiceMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilderMock.select.mockReturnThis();
    queryBuilderMock.where.mockReturnThis();
    queryBuilderMock.andWhere.mockReturnThis();
    repositoryMock.createQueryBuilder.mockReturnValue(queryBuilderMock);
  });

  // ---- Health checks ----

  it('returns ok health when db is up and provider recently successful', async () => {
    dataSourceMock.query.mockResolvedValueOnce([{ '?column?': 1 }]);
    repositoryMock.findOne.mockResolvedValueOnce({
      responseStatus: 200,
      latencyMs: 150,
    });

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(typeof result.checks.database.latency_ms).toBe('number');
    expect(result.checks.providerApiFootball.status).toBe('up');
    expect(result.checks.providerApiFootball.latency_ms).toBe(150);
    expect(typeof result.timestamp_utc).toBe('string');
    expect(typeof result.uptime).toBe('number');
  });

  it('returns down health when db is unreachable', async () => {
    dataSourceMock.query.mockRejectedValueOnce(new Error('db down'));
    repositoryMock.findOne.mockResolvedValueOnce(null);

    const result = await service.getHealth();

    expect(result.status).toBe('down');
    expect(result.checks.database.status).toBe('down');
  });

  it('returns degraded when db is up but provider last call was an error', async () => {
    dataSourceMock.query.mockResolvedValueOnce([{ '?column?': 1 }]);
    repositoryMock.findOne.mockResolvedValueOnce({
      responseStatus: 500,
      latencyMs: 1200,
    });

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.providerApiFootball.status).toBe('down');
  });

  it('returns skipped for provider when no API key configured', async () => {
    const noKeyConfigMock = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    };
    const serviceNoKey = new MonitoringService(
      dataSourceMock as any,
      repositoryMock as any,
      noKeyConfigMock as any,
    );
    dataSourceMock.query.mockResolvedValueOnce([{ '?column?': 1 }]);

    const result = await serviceNoKey.getHealth();

    expect(result.checks.providerApiFootball.status).toBe('skipped');
    expect(result.checks.providerApiFootball.latency_ms).toBeNull();
    expect(result.status).toBe('ok');
  });

  it('returns skipped for provider when no recent calls', async () => {
    dataSourceMock.query.mockResolvedValueOnce([{ '?column?': 1 }]);
    repositoryMock.findOne.mockResolvedValueOnce(null);

    const result = await service.getHealth();

    expect(result.checks.providerApiFootball.status).toBe('skipped');
  });

  // ---- Usage metrics ----

  it('returns usage metrics payload', async () => {
    const calledAt = new Date('2026-02-12T16:00:00.000Z');
    repositoryMock.count.mockResolvedValueOnce(25);
    queryBuilderMock.getCount.mockResolvedValueOnce(3);
    repositoryMock.findOne.mockResolvedValueOnce({ calledAt });

    const result = await service.getUsageMetrics();

    expect(result).toEqual({
      apiCallsLastHour: 25,
      apiErrorsLastHour: 3,
      lastProviderCallAt: '2026-02-12T16:00:00.000Z',
    });
  });

  // ---- Pipeline metrics & alerts ----

  it('returns pipeline metrics with no alerts when traffic is healthy', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce([
      { responseStatus: 200, latencyMs: 100, rateLimitRemaining: 250 },
      { responseStatus: 200, latencyMs: 150, rateLimitRemaining: 249 },
      { responseStatus: 200, latencyMs: 120, rateLimitRemaining: 248 },
      { responseStatus: 200, latencyMs: 130, rateLimitRemaining: 247 },
      { responseStatus: 200, latencyMs: 110, rateLimitRemaining: 246 },
    ]);

    const result = await service.getPipelineMetrics();

    expect(result.totalCalls).toBe(5);
    expect(result.errorRate5xx_pct).toBe(0);
    expect(result.timeoutRate_pct).toBe(0);
    expect(result.quotaRemainingMin).toBe(246);
    expect(result.alerts).toHaveLength(0);
    expect(result.window_minutes).toBe(5);
  });

  it('fires HIGH_ERROR_RATE alert when 5xx rate exceeds threshold', async () => {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      responseStatus: i < 3 ? 500 : 200,
      latencyMs: 100,
      rateLimitRemaining: 200,
    }));
    queryBuilderMock.getMany.mockResolvedValueOnce(logs);

    const result = await service.getPipelineMetrics();

    expect(result.errorRate5xx_pct).toBe(30);
    expect(result.alerts.some((a) => a.type === 'HIGH_ERROR_RATE')).toBe(true);
  });

  it('fires LOW_QUOTA alert when quota remaining is low', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce(
      Array.from({ length: 5 }, () => ({
        responseStatus: 200,
        latencyMs: 100,
        rateLimitRemaining: 5,
      })),
    );

    const result = await service.getPipelineMetrics();

    expect(result.quotaRemainingMin).toBe(5);
    expect(result.alerts.some((a) => a.type === 'LOW_QUOTA')).toBe(true);
  });

  it('does not fire alerts when call count is below minimum sample size', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce([
      { responseStatus: 500, latencyMs: 100, rateLimitRemaining: 200 },
    ]);

    const result = await service.getPipelineMetrics();

    expect(result.alerts.filter((a) => a.type !== 'LOW_QUOTA')).toHaveLength(0);
  });
});

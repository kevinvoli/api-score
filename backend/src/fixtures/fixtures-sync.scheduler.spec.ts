import { FixturesSyncScheduler } from './fixtures-sync.scheduler';

describe('FixturesSyncScheduler', () => {
  const configValues: Record<string, unknown> = {
    LIVE_FIXTURES_SYNC_ENABLED: 'true',
    LIVE_FIXTURES_SYNC_INTERVAL_MS: 30000,
    RATE_LIMIT_PER_MIN: 100,
    SYNC_RATE_LIMIT_HEADROOM_PCT: 90,
    SCHEDULER_MAX_CONSECUTIVE_FAILURES: 3,
    SCHEDULER_PAUSE_DURATION_MS: 60000,
  };

  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      return configValues[key] ?? defaultValue;
    }),
  };

  const schedulerRegistryMock = {
    addInterval: jest.fn(),
    doesExist: jest.fn().mockReturnValue(true),
    deleteInterval: jest.fn(),
  };

  const fixturesIngestionServiceMock = {
    syncLiveFixtures: jest.fn(),
  };

  const loggerMock = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const apiUsageLogRepositoryMock = {
    count: jest.fn(),
  };

  let scheduler: FixturesSyncScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new FixturesSyncScheduler(
      configServiceMock as any,
      schedulerRegistryMock as any,
      fixturesIngestionServiceMock as any,
      loggerMock as any,
      apiUsageLogRepositoryMock as any,
    );
  });

  it('runs sync tick when rate budget is available', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValueOnce(10);
    fixturesIngestionServiceMock.syncLiveFixtures.mockResolvedValueOnce({});

    await scheduler.runSyncTick();

    expect(fixturesIngestionServiceMock.syncLiveFixtures).toHaveBeenCalledTimes(1);
  });

  it('skips sync tick when rate budget is exhausted', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValueOnce(95);

    await scheduler.runSyncTick();

    expect(fixturesIngestionServiceMock.syncLiveFixtures).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_state_throttled' }),
      'FixturesSyncScheduler',
    );
  });

  it('increments consecutive failures on sync error', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);
    fixturesIngestionServiceMock.syncLiveFixtures.mockRejectedValue(new Error('provider down'));

    await scheduler.runSyncTick();
    await scheduler.runSyncTick();

    expect(loggerMock.error).toHaveBeenCalledTimes(2);
  });

  it('pauses job after reaching max consecutive failures', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);
    fixturesIngestionServiceMock.syncLiveFixtures.mockRejectedValue(new Error('provider down'));

    // 3 failures = threshold
    await scheduler.runSyncTick();
    await scheduler.runSyncTick();
    await scheduler.runSyncTick();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_state_paused' }),
      'FixturesSyncScheduler',
    );

    // Next tick should be skipped (paused)
    jest.clearAllMocks();
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);
    await scheduler.runSyncTick();

    expect(fixturesIngestionServiceMock.syncLiveFixtures).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_state_paused' }),
      'FixturesSyncScheduler',
    );
  });

  it('resumes job after pause window expires', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);
    fixturesIngestionServiceMock.syncLiveFixtures.mockRejectedValue(new Error('provider down'));

    // Trigger pause
    await scheduler.runSyncTick();
    await scheduler.runSyncTick();
    await scheduler.runSyncTick();

    // Simulate expiry by manipulating pausedUntil
    (scheduler as any).pausedUntil = Date.now() - 1;

    jest.clearAllMocks();
    fixturesIngestionServiceMock.syncLiveFixtures.mockResolvedValueOnce({});
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);

    await scheduler.runSyncTick();

    expect(loggerMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_state_resumed' }),
      'FixturesSyncScheduler',
    );
    expect(fixturesIngestionServiceMock.syncLiveFixtures).toHaveBeenCalledTimes(1);
  });

  it('resets consecutive failures after successful sync', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValue(10);
    fixturesIngestionServiceMock.syncLiveFixtures.mockRejectedValueOnce(new Error('fail'));

    await scheduler.runSyncTick();
    expect((scheduler as any).consecutiveFailures).toBe(1);

    fixturesIngestionServiceMock.syncLiveFixtures.mockResolvedValueOnce({});
    await scheduler.runSyncTick();
    expect((scheduler as any).consecutiveFailures).toBe(0);
  });
});

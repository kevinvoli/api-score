import { FixturesSyncScheduler } from './fixtures-sync.scheduler';

describe('FixturesSyncScheduler', () => {
  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        LIVE_FIXTURES_SYNC_ENABLED: 'true',
        LIVE_FIXTURES_SYNC_INTERVAL_MS: 30000,
        RATE_LIMIT_PER_MIN: 100,
        SYNC_RATE_LIMIT_HEADROOM_PCT: 90,
      };
      return values[key] ?? defaultValue;
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

  const scheduler = new FixturesSyncScheduler(
    configServiceMock as any,
    schedulerRegistryMock as any,
    fixturesIngestionServiceMock as any,
    loggerMock as any,
    apiUsageLogRepositoryMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs sync tick when rate budget is available', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValueOnce(10);

    await scheduler.runSyncTick();

    expect(fixturesIngestionServiceMock.syncLiveFixtures).toHaveBeenCalledTimes(1);
  });

  it('skips sync tick when rate budget is exhausted', async () => {
    apiUsageLogRepositoryMock.count.mockResolvedValueOnce(95);

    await scheduler.runSyncTick();

    expect(fixturesIngestionServiceMock.syncLiveFixtures).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

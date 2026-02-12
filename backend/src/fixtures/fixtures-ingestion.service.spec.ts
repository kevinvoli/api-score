import { FixturesIngestionService } from './fixtures-ingestion.service';

describe('FixturesIngestionService', () => {
  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        LIVE_READ_CACHE_TTL_MS: 60000,
      };
      return values[key] ?? defaultValue;
    }),
  };
  const apiFootballClientMock = {
    fetchLiveFixtures: jest.fn(),
    fetchFixtureEvents: jest.fn(),
    fetchFixtureStatistics: jest.fn(),
    fetchFixtureLineups: jest.fn(),
    fetchFixturePlayers: jest.fn(),
  };
  const loggerMock = { log: jest.fn(), error: jest.fn() };
  const fixtureRepositoryMock = {
    upsert: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const fixtureEventRepositoryMock = {
    delete: jest.fn(),
    insert: jest.fn(),
    find: jest.fn(),
  };
  const fixtureLineupRepositoryMock = {
    delete: jest.fn(),
    insert: jest.fn(),
    find: jest.fn(),
  };
  const fixturePlayerStatsSnapshotRepositoryMock = {
    insert: jest.fn(),
    find: jest.fn(),
  };
  const fixtureStatsSnapshotRepositoryMock = {
    insert: jest.fn(),
    find: jest.fn(),
  };

  const service = new FixturesIngestionService(
    configServiceMock as any,
    apiFootballClientMock as any,
    loggerMock as any,
    fixtureRepositoryMock as any,
    fixtureEventRepositoryMock as any,
    fixtureLineupRepositoryMock as any,
    fixturePlayerStatsSnapshotRepositoryMock as any,
    fixtureStatsSnapshotRepositoryMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns filtered paginated fixtures list', async () => {
    const queryBuilderMock = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'fx-1' }], 1]),
    };
    fixtureRepositoryMock.createQueryBuilder.mockReturnValue(queryBuilderMock);

    const result = await service.getLatestFixtures({
      leagueId: 39,
      statusShort: '1H',
      minElapsed: 10,
      maxElapsed: 45,
      teamId: 10,
      page: 2,
      limit: 5,
      sortBy: 'elapsed',
      sortOrder: 'ASC',
    });

    expect(queryBuilderMock.andWhere).toHaveBeenCalled();
    expect(queryBuilderMock.orderBy).toHaveBeenCalledWith(
      'fixture.elapsed',
      'ASC',
    );
    expect(queryBuilderMock.skip).toHaveBeenCalledWith(5);
    expect(queryBuilderMock.take).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      items: [{ id: 'fx-1' }],
      page: 2,
      limit: 5,
      total: 1,
    });
  });

  it('returns cached fixtures list for identical query', async () => {
    const queryBuilderMock = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'fx-cache' }], 1]),
    };
    fixtureRepositoryMock.createQueryBuilder.mockReturnValue(queryBuilderMock);

    const query = {
      page: 1,
      limit: 20,
      sortBy: 'lastSyncedAt' as const,
      sortOrder: 'DESC' as const,
    };

    const first = await service.getLatestFixtures(query);
    const second = await service.getLatestFixtures(query);

    expect(first).toEqual(second);
    expect(queryBuilderMock.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('returns latest snapshot lineups only', async () => {
    fixtureRepositoryMock.findOne.mockResolvedValueOnce({ id: 'fixture-row-2' });
    fixtureLineupRepositoryMock.find.mockResolvedValueOnce([
      { id: 'l2', snapshotAt: new Date('2026-02-12T10:00:00.000Z') },
      { id: 'l1', snapshotAt: new Date('2026-02-12T10:00:00.000Z') },
      { id: 'l0', snapshotAt: new Date('2026-02-12T09:59:00.000Z') },
    ]);

    const result = await service.getFixtureLineups(2001);

    expect(result).toEqual([
      { id: 'l2', snapshotAt: new Date('2026-02-12T10:00:00.000Z') },
      { id: 'l1', snapshotAt: new Date('2026-02-12T10:00:00.000Z') },
    ]);
  });

  it('returns latest snapshot players only', async () => {
    fixtureRepositoryMock.findOne.mockResolvedValueOnce({ id: 'fixture-row-3' });
    fixturePlayerStatsSnapshotRepositoryMock.find.mockResolvedValueOnce([
      { id: 'p2', snapshotAt: new Date('2026-02-12T10:05:00.000Z') },
      { id: 'p1', snapshotAt: new Date('2026-02-12T10:05:00.000Z') },
      { id: 'p0', snapshotAt: new Date('2026-02-12T10:03:00.000Z') },
    ]);

    const result = await service.getFixturePlayers(2002);

    expect(result).toEqual([
      { id: 'p2', snapshotAt: new Date('2026-02-12T10:05:00.000Z') },
      { id: 'p1', snapshotAt: new Date('2026-02-12T10:05:00.000Z') },
    ]);
  });

  it('returns latest snapshot stats only', async () => {
    fixtureRepositoryMock.findOne.mockResolvedValueOnce({ id: 'fixture-row-4' });
    fixtureStatsSnapshotRepositoryMock.find.mockResolvedValueOnce([
      { id: 's2', snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
      { id: 's1', snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
      { id: 's0', snapshotAt: new Date('2026-02-12T10:02:00.000Z') },
    ]);

    const result = await service.getFixtureLatestStats(3003);

    expect(result).toEqual([
      { id: 's2', snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
      { id: 's1', snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
    ]);
  });

  it('returns fixture summary with momentum and data quality flags', async () => {
    fixtureRepositoryMock.findOne.mockResolvedValueOnce({
      id: 'fixture-row-5',
      providerFixtureId: '5005',
      leagueId: 39,
      statusShort: '1H',
      statusLong: 'First Half',
      elapsed: 27,
      matchDate: new Date('2026-02-12T12:00:00.000Z'),
      scoreHome: 1,
      scoreAway: 0,
      homeTeamId: 10,
      awayTeamId: 20,
      lastSyncedAt: new Date(),
    });
    fixtureStatsSnapshotRepositoryMock.find.mockResolvedValueOnce([
      {
        teamId: 10,
        snapshotAt: new Date('2026-02-12T10:06:00.000Z'),
        stats: {
          statistics: [
            { type: 'Attacks', value: 35 },
            { type: 'Dangerous Attacks', value: 19 },
            { type: 'On Target', value: 5 },
            { type: 'Off Target', value: 2 },
            { type: 'Corners', value: 4 },
          ],
        },
      },
      {
        teamId: 20,
        snapshotAt: new Date('2026-02-12T10:06:00.000Z'),
        stats: {
          statistics: [
            { type: 'Attacks', value: 22 },
            { type: 'Dangerous Attacks', value: 9 },
            { type: 'On Target', value: 2 },
            { type: 'Off Target', value: 4 },
            { type: 'Corners', value: 2 },
          ],
        },
      },
    ]);
    fixtureLineupRepositoryMock.find.mockResolvedValueOnce([
      { snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
    ]);
    fixturePlayerStatsSnapshotRepositoryMock.find.mockResolvedValueOnce([
      { snapshotAt: new Date('2026-02-12T10:06:00.000Z') },
    ]);
    fixtureEventRepositoryMock.find.mockResolvedValueOnce([
      { minute: 26, eventType: 'Goal', detail: 'Normal Goal', teamId: 10 },
    ]);

    const result = await service.getFixtureSummary(5005);

    expect(result).toEqual(
      expect.objectContaining({
        fixture: expect.objectContaining({
          providerFixtureId: '5005',
          statusShort: '1H',
          elapsed: 27,
        }),
        momentum: expect.objectContaining({
          dominantSide: 'home',
        }),
        dataQuality: expect.objectContaining({
          hasRecentStats: true,
          hasLineups: true,
          hasPlayerStats: true,
          isStale: false,
        }),
        confidence: expect.any(Number),
      }),
    );
    expect((result as { confidence: number }).confidence).toBeGreaterThan(60);
  });

  it('syncs live fixtures with events and stats', async () => {
    apiFootballClientMock.fetchLiveFixtures.mockResolvedValueOnce([
      {
        fixture: {
          id: 123,
          status: { short: '1H', long: 'First Half', elapsed: 21 },
          date: '2026-02-12T12:00:00.000Z',
        },
        league: { id: 39, season: 2025 },
        teams: { home: { id: 1 }, away: { id: 2 } },
        goals: { home: 1, away: 0 },
      },
    ]);
    fixtureRepositoryMock.findOne.mockResolvedValue({
      id: 'fixture-row-1',
      providerFixtureId: '123',
      elapsed: 21,
    });
    apiFootballClientMock.fetchFixtureEvents.mockResolvedValueOnce([
      { time: { elapsed: 20 }, type: 'Goal' },
    ]);
    apiFootballClientMock.fetchFixtureStatistics.mockResolvedValueOnce([
      { team: { id: 1 }, statistics: [] },
    ]);
    apiFootballClientMock.fetchFixtureLineups.mockResolvedValueOnce([
      { team: { id: 1 }, formation: '4-3-3' },
    ]);
    apiFootballClientMock.fetchFixturePlayers.mockResolvedValueOnce([
      { team: { id: 1 }, players: [{ player: { id: 88 } }] },
    ]);

    const result = await service.syncLiveFixtures();

    expect(result).toEqual({
      fixturesSynced: 1,
      eventsSynced: 1,
      statsSynced: 1,
      lineupsSynced: 1,
      playerStatsSynced: 1,
    });
    expect(fixtureRepositoryMock.upsert).toHaveBeenCalledTimes(1);
    expect(fixtureEventRepositoryMock.delete).toHaveBeenCalledTimes(1);
    expect(fixtureEventRepositoryMock.insert).toHaveBeenCalledTimes(1);
    expect(fixtureStatsSnapshotRepositoryMock.insert).toHaveBeenCalledTimes(1);
    expect(fixtureLineupRepositoryMock.insert).toHaveBeenCalledTimes(1);
    expect(fixturePlayerStatsSnapshotRepositoryMock.insert).toHaveBeenCalledTimes(1);
  });
});

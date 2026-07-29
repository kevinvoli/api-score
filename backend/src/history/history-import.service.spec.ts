import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HistoryImportService } from './history-import.service';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { RateBudgetService } from '../common/services/rate-budget.service';
import { JsonLogger } from '../common/json.logger';
import {
  APIFOOTBALL_HISTORY_MATCH_SAMPLE,
  APIFOOTBALL_HISTORY_MATCH_SAMPLE_NO_STATS,
} from './__fixtures__/apifootball-history.sample';

// ── Helpers ───────────────────────────────────────────────

function mockFixtureRepository() {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
  };
}

function mockDeleteInsertRepository() {
  return {
    delete: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-uuid-690949',
    providerFixtureId: '690949',
    leagueId: 177,
    season: null,
    homeTeamId: 32645,
    awayTeamId: 4288,
    homeTeamName: 'Nations FC',
    awayTeamName: 'Bechem United',
    homeTeamBadge: null,
    awayTeamBadge: null,
    leagueName: 'Premier League',
    statusShort: 'FT',
    statusLong: 'Finished',
    elapsed: null,
    matchDate: new Date('2026-03-06T16:00:00'),
    scoreHome: 3,
    scoreAway: 0,
    raw: {},
    lastSyncedAt: new Date(),
    events: [],
    statsSnapshots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Fixture;
}

// ── Suite principale ──────────────────────────────────────

describe('HistoryImportService', () => {
  let service: HistoryImportService;
  let fixtureRepo: ReturnType<typeof mockFixtureRepository>;
  let statsSnapshotRepo: ReturnType<typeof mockDeleteInsertRepository>;
  let eventRepo: ReturnType<typeof mockDeleteInsertRepository>;
  let apiClient: Record<string, jest.Mock>;
  let rateBudget: { hasBudget: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    apiClient = {
      fetchLeagueFixtures: jest.fn().mockResolvedValue([]),
      getProvider: jest.fn().mockReturnValue('apifootball'),
      fetchFixtureStatistics: jest.fn().mockResolvedValue([]),
      fetchFixtureEvents: jest.fn().mockResolvedValue([]),
    };
    rateBudget = { hasBudget: jest.fn().mockResolvedValue(true) };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    fixtureRepo = mockFixtureRepository();
    fixtureRepo.findOne.mockResolvedValue(makeFixture());
    statsSnapshotRepo = mockDeleteInsertRepository();
    eventRepo = mockDeleteInsertRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryImportService,
        { provide: ApiFootballClient, useValue: apiClient },
        { provide: RateBudgetService, useValue: rateBudget },
        { provide: JsonLogger, useValue: logger },
        { provide: getRepositoryToken(Fixture), useValue: fixtureRepo },
        {
          provide: getRepositoryToken(FixtureStatsSnapshot),
          useValue: statsSnapshotRepo,
        },
        { provide: getRepositoryToken(FixtureEvent), useValue: eventRepo },
      ],
    }).compile();

    service = module.get<HistoryImportService>(HistoryImportService);
  });

  describe('découpage en fenêtres de 5 jours', () => {
    it('découpe une plage de 12 jours en 3 fenêtres de 5 jours maximum', async () => {
      const result = await service.importLeagueSeason(
        177,
        new Date(2026, 2, 1),
        new Date(2026, 2, 12),
      );

      expect(result.windowsProcessed).toBe(3);
      expect(apiClient.fetchLeagueFixtures).toHaveBeenCalledTimes(3);
      expect(apiClient.fetchLeagueFixtures).toHaveBeenNthCalledWith(
        1,
        177,
        '2026-03-01',
        '2026-03-05',
      );
      expect(apiClient.fetchLeagueFixtures).toHaveBeenNthCalledWith(
        2,
        177,
        '2026-03-06',
        '2026-03-10',
      );
      expect(apiClient.fetchLeagueFixtures).toHaveBeenNthCalledWith(
        3,
        177,
        '2026-03-11',
        '2026-03-12',
      );
    });

    it('dé-duplique un même match apparu dans plusieurs fenêtres', async () => {
      apiClient.fetchLeagueFixtures
        .mockResolvedValueOnce([APIFOOTBALL_HISTORY_MATCH_SAMPLE])
        .mockResolvedValueOnce([APIFOOTBALL_HISTORY_MATCH_SAMPLE]);

      const result = await service.importLeagueSeason(
        177,
        new Date(2026, 2, 1),
        new Date(2026, 2, 6),
      );

      expect(result.windowsProcessed).toBe(2);
      expect(result.matchesFound).toBe(1);
      expect(result.fixturesUpserted).toBe(1);
      expect(fixtureRepo.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistance des snapshots MT/FT', () => {
    it('crée deux snapshots par équipe (mi-temps depuis statistics_1half, fin de match depuis statistics)', async () => {
      apiClient.fetchLeagueFixtures.mockResolvedValue([
        APIFOOTBALL_HISTORY_MATCH_SAMPLE,
      ]);

      const result = await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      expect(result.snapshotsCreated).toBe(4);
      const rows = statsSnapshotRepo.insert.mock.calls[0][0] as Array<{
        teamId: number;
        half: string;
        elapsed: number;
        stats: { statistics: Array<{ type: string; value: unknown }> };
      }>;
      expect(rows).toHaveLength(4);

      const homeHalftime = rows.find(
        (r) => r.teamId === 32645 && r.half === '1',
      );
      expect(homeHalftime?.elapsed).toBe(45);
      expect(homeHalftime?.stats.statistics).toContainEqual({
        type: 'On Target',
        value: '4',
      });

      const homeFinal = rows.find((r) => r.teamId === 32645 && r.half === '2');
      expect(homeFinal?.elapsed).toBe(90);
      expect(homeFinal?.stats.statistics).toContainEqual({
        type: 'On Target',
        value: '5',
      });

      const awayHalftime = rows.find(
        (r) => r.teamId === 4288 && r.half === '1',
      );
      expect(awayHalftime?.stats.statistics).toContainEqual({
        type: 'On Target',
        value: '1',
      });
    });
  });

  describe('extraction des buts', () => {
    it('extrait les buts avec la bonne minute et la bonne équipe', async () => {
      apiClient.fetchLeagueFixtures.mockResolvedValue([
        APIFOOTBALL_HISTORY_MATCH_SAMPLE,
      ]);

      const result = await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      expect(result.eventsCreated).toBe(3);
      expect(result.goalsImported).toBe(3);
      const rows = eventRepo.insert.mock.calls[0][0] as Array<{
        teamId: number;
        minute: number;
        eventType: string;
      }>;
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.teamId === 32645)).toBe(true);
      expect(rows.map((r) => r.minute)).toEqual([10, 45, 90]);
      expect(rows.every((r) => r.eventType === 'Goal')).toBe(true);
    });
  });

  describe('normalisation des statuts', () => {
    it("normalise 'Finished' en 'FT' via normalizeFixturePayload partagé", async () => {
      apiClient.fetchLeagueFixtures.mockResolvedValue([
        APIFOOTBALL_HISTORY_MATCH_SAMPLE,
      ]);

      await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      const upserted = fixtureRepo.upsert.mock.calls[0][0] as {
        statusShort: string;
      };
      expect(upserted.statusShort).toBe('FT');
    });
  });

  describe('idempotence', () => {
    it('réimporter la même période purge puis réinsère, sans jamais accumuler de doublons', async () => {
      apiClient.fetchLeagueFixtures.mockResolvedValue([
        APIFOOTBALL_HISTORY_MATCH_SAMPLE,
      ]);

      await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );
      await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      expect(statsSnapshotRepo.delete).toHaveBeenCalledTimes(2);
      expect(statsSnapshotRepo.insert).toHaveBeenCalledTimes(2);
      expect(statsSnapshotRepo.insert.mock.calls[0][0]).toHaveLength(4);
      expect(statsSnapshotRepo.insert.mock.calls[1][0]).toHaveLength(4);

      expect(eventRepo.delete).toHaveBeenCalledTimes(2);
      expect(eventRepo.insert).toHaveBeenCalledTimes(2);
      expect(eventRepo.insert.mock.calls[0][0]).toHaveLength(3);
      expect(eventRepo.insert.mock.calls[1][0]).toHaveLength(3);
    });
  });

  describe('match sans statistiques', () => {
    it('ne plante pas et ne crée ni snapshot ni événement', async () => {
      fixtureRepo.findOne.mockResolvedValue(
        makeFixture({ id: 'fixture-uuid-690950', providerFixtureId: '690950' }),
      );
      apiClient.fetchLeagueFixtures.mockResolvedValue([
        APIFOOTBALL_HISTORY_MATCH_SAMPLE_NO_STATS,
      ]);

      const result = await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      expect(result.fixturesUpserted).toBe(1);
      expect(result.snapshotsCreated).toBe(0);
      expect(result.eventsCreated).toBe(0);
      expect(statsSnapshotRepo.insert).not.toHaveBeenCalled();
      expect(eventRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('quota', () => {
    it('attend que le budget se libère avant chaque appel réseau', async () => {
      rateBudget.hasBudget
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      // Évite d'attendre réellement les 2s de backoff dans le test.
      jest
        .spyOn(
          service as unknown as { sleep: (ms: number) => Promise<void> },
          'sleep',
        )
        .mockResolvedValue(undefined);

      await service.importLeagueSeason(
        177,
        new Date(2026, 2, 6),
        new Date(2026, 2, 6),
      );

      expect(rateBudget.hasBudget).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'history_import_throttled' }),
        'HistoryImportService',
      );
    });
  });
});

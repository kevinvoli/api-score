import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FixturesIngestionService } from './fixtures-ingestion.service';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureLineup } from '../database/entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from '../database/entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Team } from '../database/entities/team.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { JsonLogger } from '../common/json.logger';
import { computePressureIndex } from '../common/utils/stats.utils';

// ── Helpers ───────────────────────────────────────────────

function mockRepository() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto: object) => dto),
    delete: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  };
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-uuid-1',
    providerFixtureId: '99999',
    leagueId: 61,
    season: 2024,
    homeTeamId: 10,
    awayTeamId: 20,
    homeTeamName: 'PSG',
    awayTeamName: 'Lyon',
    homeTeamBadge: null,
    awayTeamBadge: null,
    leagueName: 'Ligue 1',
    statusShort: '1H',
    statusLong: 'First Half',
    elapsed: 30,
    matchDate: new Date('2024-01-15T20:00:00Z'),
    scoreHome: 0,
    scoreAway: 0,
    raw: {},
    lastSyncedAt: new Date(Date.now() - 30_000), // synced 30s ago → pas stale
    events: [],
    statsSnapshots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Fixture;
}

function makeStatsSnapshot(overrides: Partial<FixtureStatsSnapshot> = {}): FixtureStatsSnapshot {
  const now = new Date();
  return {
    id: 'snap-uuid-1',
    fixtureId: 'fixture-uuid-1',
    teamId: 10,
    half: null,
    elapsed: 30,
    stats: {},
    snapshotAt: now,
    createdAt: now,
    fixture: undefined as unknown as Fixture,
    ...overrides,
  } as FixtureStatsSnapshot;
}

// ── Suite principale ──────────────────────────────────────

describe('FixturesIngestionService', () => {
  let service: FixturesIngestionService;
  let fixtureRepo: ReturnType<typeof mockRepository>;
  let fixtureEventRepo: ReturnType<typeof mockRepository>;
  let fixtureLineupRepo: ReturnType<typeof mockRepository>;
  let fixturePlayerRepo: ReturnType<typeof mockRepository>;
  let fixtureStatsRepo: ReturnType<typeof mockRepository>;
  let teamRepo: ReturnType<typeof mockRepository>;
  let configService: { get: jest.Mock };
  let apiClient: Record<string, jest.Mock>;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  // TTL par défaut pour les tests : 30 000 ms (cache actif)
  const DEFAULT_TTL = 30_000;

  function buildModule(ttlMs: number): Promise<TestingModule> {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: number) =>
        key === 'LIVE_READ_CACHE_TTL_MS' ? ttlMs : defaultVal,
      ),
    };

    apiClient = {
      fetchLiveFixtures:        jest.fn().mockResolvedValue([]),
      fetchFixtureEvents:       jest.fn().mockResolvedValue([]),
      fetchFixtureStatistics:   jest.fn().mockResolvedValue([]),
      fetchFixtureLineups:      jest.fn().mockResolvedValue([]),
      fetchFixturePlayers:      jest.fn().mockResolvedValue([]),
      fetchTeamsByLeague:       jest.fn().mockResolvedValue([]),
      fetchTeamById:            jest.fn().mockResolvedValue(null),
    };

    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    fixtureRepo       = mockRepository();
    fixtureEventRepo  = mockRepository();
    fixtureLineupRepo = mockRepository();
    fixturePlayerRepo = mockRepository();
    fixtureStatsRepo  = mockRepository();
    teamRepo          = mockRepository();

    return Test.createTestingModule({
      providers: [
        FixturesIngestionService,
        { provide: ConfigService,                                       useValue: configService },
        { provide: ApiFootballClient,                                   useValue: apiClient },
        { provide: JsonLogger,                                          useValue: logger },
        { provide: getRepositoryToken(Fixture),                        useValue: fixtureRepo },
        { provide: getRepositoryToken(FixtureEvent),                   useValue: fixtureEventRepo },
        { provide: getRepositoryToken(FixtureLineup),                  useValue: fixtureLineupRepo },
        { provide: getRepositoryToken(FixturePlayerStatsSnapshot),     useValue: fixturePlayerRepo },
        { provide: getRepositoryToken(FixtureStatsSnapshot),           useValue: fixtureStatsRepo },
        { provide: getRepositoryToken(Team),                           useValue: teamRepo },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule(DEFAULT_TTL);
    service = module.get<FixturesIngestionService>(FixturesIngestionService);
  });

  // ── computePressureIndex (fonction pure) ─────────────────

  describe('computePressureIndex() — fonction pure de stats.utils', () => {
    it('retourne 0 pour un payload null', () => {
      expect(computePressureIndex(null)).toBe(0);
    });

    it('applique la formule correcte : dangerousAttacks*1.4 + onTarget*2 + corners*1.2 + attacks*0.15 - offTarget*0.4', () => {
      const stats = {
        statistics: [
          { type: 'Dangerous Attacks', value: 10 },
          { type: 'On Target',         value: 5 },
          { type: 'Corner Kicks',      value: 3 },
          { type: 'Attacks',           value: 20 },
          { type: 'Off Target',        value: 4 },
        ],
      };
      // 10*1.4 + 5*2 + 3*1.2 + 20*0.15 - 4*0.4
      // = 14 + 10 + 3.6 + 3 - 1.6 = 29
      expect(computePressureIndex(stats)).toBe(29);
    });

    it('utilise "Shots on Goal" comme alias de "On Target"', () => {
      const stats = {
        statistics: [
          { type: 'Shots on Goal', value: 4 },
        ],
      };
      // 4*2 = 8
      expect(computePressureIndex(stats)).toBe(8);
    });

    it('utilise "Corners" comme alias de "Corner Kicks"', () => {
      const stats = {
        statistics: [
          { type: 'Corners', value: 5 },
        ],
      };
      // 5*1.2 = 6
      expect(computePressureIndex(stats)).toBe(6);
    });

    it('retourne 0 si le payload ne contient aucune statistique reconnue', () => {
      expect(computePressureIndex({})).toBe(0);
    });

    it('soustrait correctement les tirs non cadrés', () => {
      const stats = {
        statistics: [
          { type: 'Off Target', value: 10 },
        ],
      };
      // -10*0.4 = -4, mais max(0, ...) n'est pas dans computePressureIndex → résultat négatif possible
      expect(computePressureIndex(stats)).toBe(-4);
    });
  });

  // ── getFixtureSummary — confidence entre 0 et 100 ────────

  describe('getFixtureSummary()', () => {
    function setupSummaryMocks(fixtureOverrides: Partial<Fixture> = {}) {
      const fixture = makeFixture(fixtureOverrides);
      fixtureRepo.findOne.mockResolvedValue(fixture);

      const now = new Date();
      const statsSnap = makeStatsSnapshot({
        teamId: fixture.homeTeamId ?? 10,
        snapshotAt: now,
        stats: {
          statistics: [
            { type: 'Total Shots', value: 5 },
          ],
        },
      });

      fixtureStatsRepo.find.mockResolvedValue([statsSnap]);
      fixtureLineupRepo.find.mockResolvedValue([]);
      fixturePlayerRepo.find.mockResolvedValue([]);
      fixtureEventRepo.find.mockResolvedValue([]);
    }

    it('retourne un objet contenant confidence entre 0 et 100', async () => {
      setupSummaryMocks();

      const result = await service.getFixtureSummary(99999);

      expect(result).not.toBeNull();
      expect(typeof (result as Record<string, unknown>).confidence).toBe('number');
      const confidence = (result as Record<string, unknown>).confidence as number;
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    it('confidence ≤ 20 quand aucune stat, lineup, ni playerStats disponibles', async () => {
      const fixture = makeFixture({
        lastSyncedAt: new Date(Date.now() - 200_000), // stale
      });
      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureStatsRepo.find.mockResolvedValue([]);
      fixtureLineupRepo.find.mockResolvedValue([]);
      fixturePlayerRepo.find.mockResolvedValue([]);
      fixtureEventRepo.find.mockResolvedValue([]);

      const result = await service.getFixtureSummary(99999) as Record<string, unknown>;

      expect((result.confidence as number)).toBeLessThanOrEqual(20);
    });

    it('retourne null si la fixture est introuvable', async () => {
      fixtureRepo.findOne.mockResolvedValue(null);

      const result = await service.getFixtureSummary(0);

      expect(result).toBeNull();
    });

    it('contient les champs momentum et dataQuality dans la réponse', async () => {
      setupSummaryMocks();

      const result = await service.getFixtureSummary(99999) as Record<string, unknown>;

      expect(result).toHaveProperty('momentum');
      expect(result).toHaveProperty('dataQuality');
      expect(result).toHaveProperty('fixture');
    });
  });

  // ── Cache TTL actif ───────────────────────────────────────

  describe('cache TTL > 0 — retourne la valeur en cache', () => {
    it('ne rappelle pas findOne si la clé est en cache (getFixtureLatestStats)', async () => {
      const fixture = makeFixture();
      const now = new Date();
      const snap = makeStatsSnapshot({ snapshotAt: now });

      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureStatsRepo.find.mockResolvedValue([snap]);

      // Premier appel → miss cache → appel repository
      await service.getFixtureLatestStats(99999);
      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(1);
      expect(fixtureStatsRepo.find).toHaveBeenCalledTimes(1);

      // Deuxième appel avec le même fixtureId → hit cache → pas d'appel repo supplémentaire
      await service.getFixtureLatestStats(99999);
      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(1);
      expect(fixtureStatsRepo.find).toHaveBeenCalledTimes(1);
    });

    it('ne rappelle pas findOne si la clé est en cache (getFixtureEvents)', async () => {
      const fixture = makeFixture();
      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureEventRepo.find.mockResolvedValue([]);

      await service.getFixtureEvents(99999);
      await service.getFixtureEvents(99999);

      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('ne rappelle pas findOne si la clé est en cache (getFixtureLineups)', async () => {
      const fixture = makeFixture();
      const now = new Date();
      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureLineupRepo.find.mockResolvedValue([]);

      await service.getFixtureLineups(99999);
      await service.getFixtureLineups(99999);

      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  // ── Cache TTL = 0 — bypass systématique ──────────────────

  describe('cache TTL = 0 — bypass complet du cache', () => {
    beforeEach(async () => {
      const module = await buildModule(0);
      service = module.get<FixturesIngestionService>(FixturesIngestionService);
    });

    it('appelle le repository à chaque appel sans mettre en cache (getFixtureLatestStats)', async () => {
      const fixture = makeFixture();
      const now = new Date();
      const snap = makeStatsSnapshot({ snapshotAt: now });

      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureStatsRepo.find.mockResolvedValue([snap]);

      await service.getFixtureLatestStats(99999);
      await service.getFixtureLatestStats(99999);

      // Deux appels → deux accès repository car TTL = 0 désactive le cache
      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(2);
      expect(fixtureStatsRepo.find).toHaveBeenCalledTimes(2);
    });

    it('appelle le repository à chaque appel sans mettre en cache (getFixtureEvents)', async () => {
      const fixture = makeFixture();
      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureEventRepo.find.mockResolvedValue([]);

      await service.getFixtureEvents(99999);
      await service.getFixtureEvents(99999);

      expect(fixtureRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ── getFixturesHistory ────────────────────────────────────

  describe('getFixturesHistory()', () => {
    it('retourne items et limit avec les valeurs par défaut', async () => {
      const fixtures = [makeFixture(), makeFixture({ id: 'fixture-2', providerFixtureId: '2' })];
      fixtureRepo.find.mockResolvedValue(fixtures);

      const result = await service.getFixturesHistory({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('limit');
      expect(result.items).toHaveLength(2);
      expect(result.limit).toBe(10);
    });

    it('respecte la limite personnalisée', async () => {
      fixtureRepo.find.mockResolvedValue([]);

      await service.getFixturesHistory({ limit: 5 });

      expect(fixtureRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  // ── Détection N+1 ─────────────────────────────────────────

  describe('performance — pas de N+1', () => {
    it('ne fait qu\'un seul appel find pour récupérer les events d\'une fixture', async () => {
      const fixture = makeFixture();
      fixtureRepo.findOne.mockResolvedValue(fixture);
      fixtureEventRepo.find.mockResolvedValue([]);

      await service.getFixtureEvents(99999);

      expect(fixtureEventRepo.find).toHaveBeenCalledTimes(1);
    });
  });
});

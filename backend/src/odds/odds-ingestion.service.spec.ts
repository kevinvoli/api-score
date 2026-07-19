import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OddsIngestionService } from './odds-ingestion.service';
import { Fixture } from '../database/entities/fixture.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { JsonLogger } from '../common/json.logger';
import { APIFOOTBALL_ODDS_SAMPLE } from './__fixtures__/apifootball-odds.sample';

// ── Helpers ───────────────────────────────────────────────

function mockRepository() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  return {
    find: jest.fn(),
    findOne: jest.fn(),
    insert: jest.fn(),
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
    statusShort: 'NS',
    statusLong: 'Not Started',
    elapsed: null,
    matchDate: new Date('2024-01-15T20:00:00Z'),
    scoreHome: null,
    scoreAway: null,
    raw: {},
    lastSyncedAt: new Date(),
    events: [],
    statsSnapshots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Fixture;
}

function makeBet(name: string, values: Array<{ value: string; odd: string }>) {
  return { name, values };
}

// ── Suite principale ──────────────────────────────────────

describe('OddsIngestionService', () => {
  let service: OddsIngestionService;
  let fixtureRepo: ReturnType<typeof mockRepository>;
  let oddsRepo: ReturnType<typeof mockRepository>;
  let apiClient: Record<string, jest.Mock>;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    apiClient = {
      fetchPrematchOdds: jest.fn().mockResolvedValue([]),
      fetchLiveOdds: jest.fn().mockResolvedValue([]),
      getProvider: jest.fn().mockReturnValue('apisports'),
    };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    fixtureRepo = mockRepository();
    oddsRepo = mockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OddsIngestionService,
        { provide: ApiFootballClient, useValue: apiClient },
        { provide: JsonLogger, useValue: logger },
        { provide: getRepositoryToken(Fixture), useValue: fixtureRepo },
        { provide: getRepositoryToken(OddsSnapshot), useValue: oddsRepo },
      ],
    }).compile();

    service = module.get<OddsIngestionService>(OddsIngestionService);
  });

  describe('syncPrematchOdds()', () => {
    it("récupère les fixtures NS et insère les snapshots d'un marché 1X2 complet", async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        {
          bookmakers: [
            {
              id: 8,
              name: 'Bet365',
              bets: [
                makeBet('Match Winner', [
                  { value: 'Home', odd: '2.10' },
                  { value: 'Draw', odd: '3.40' },
                  { value: 'Away', odd: '3.60' },
                ]),
              ],
            },
          ],
        },
      ]);

      const result = await service.syncPrematchOdds();

      expect(fixtureRepo.createQueryBuilder).toHaveBeenCalledWith('fixture');
      expect(apiClient.fetchPrematchOdds).toHaveBeenCalledWith('99999');
      expect(oddsRepo.insert).toHaveBeenCalledTimes(1);

      const rows = oddsRepo.insert.mock.calls[0][0];
      expect(rows).toHaveLength(3);
      expect(rows.every((r: any) => r.marketType === '1X2')).toBe(true);
      expect(rows.every((r: any) => r.phase === 'PREMATCH')).toBe(true);

      const sumFair = rows.reduce(
        (acc: number, r: any) => acc + r.impliedProbabilityFair,
        0,
      );
      expect(sumFair).toBeCloseTo(1, 10);

      expect(result).toEqual({ fixturesProcessed: 1, snapshotsInserted: 3 });
    });

    it('saute un marché 1X2 incomplet (une issue manquante) sans insérer ni fausser', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        {
          bookmakers: [
            {
              id: 8,
              name: 'Bet365',
              bets: [
                makeBet('Match Winner', [
                  { value: 'Home', odd: '2.10' },
                  { value: 'Draw', odd: '3.40' },
                  // Away manquant
                ]),
              ],
            },
          ],
        },
      ]);

      const result = await service.syncPrematchOdds();

      expect(oddsRepo.insert).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'odds_ingestion_incomplete_market' }),
        'OddsIngestionService',
      );
      expect(result.snapshotsInserted).toBe(0);
    });

    it('ignore une cote invalide (<=1) et journalise un warn', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        {
          bookmakers: [
            {
              id: 8,
              name: 'Bet365',
              bets: [
                makeBet('Both Teams Score', [
                  { value: 'Yes', odd: '1.80' },
                  { value: 'No', odd: '1' }, // cote invalide
                ]),
              ],
            },
          ],
        },
      ]);

      await service.syncPrematchOdds();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'odds_ingestion_invalid_odd' }),
        'OddsIngestionService',
      );
      // BTTS attend 2 issues ; il n'en reste qu'une valide → marché incomplet → rien inséré
      expect(oddsRepo.insert).not.toHaveBeenCalled();
    });

    it('ignore un bet non reconnu', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        {
          bookmakers: [
            {
              id: 8,
              name: 'Bet365',
              bets: [makeBet('Correct Score', [{ value: '1:0', odd: '7.50' }])],
            },
          ],
        },
      ]);

      const result = await service.syncPrematchOdds();

      expect(oddsRepo.insert).not.toHaveBeenCalled();
      expect(result.snapshotsInserted).toBe(0);
    });

    it('normalise un marché Over/Under en OU_<ligne>', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        {
          bookmakers: [
            {
              id: 8,
              name: 'Bet365',
              bets: [
                makeBet('Over/Under', [
                  { value: 'Over 2.5', odd: '1.90' },
                  { value: 'Under 2.5', odd: '1.95' },
                ]),
              ],
            },
          ],
        },
      ]);

      await service.syncPrematchOdds();

      const rows = oddsRepo.insert.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0].marketType).toBe('OU_2.5');
      expect(rows.map((r: any) => r.outcome).sort()).toEqual(['OVER', 'UNDER']);
    });
  });

  describe('syncPrematchOdds() — provider apifootball', () => {
    beforeEach(() => {
      apiClient.getProvider.mockReturnValue('apifootball');
    });

    it('ingère les marchés 1X2, OU, AH et BTTS depuis le format plat apifootball', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue(APIFOOTBALL_ODDS_SAMPLE);

      const result = await service.syncPrematchOdds();

      expect(apiClient.fetchPrematchOdds).toHaveBeenCalledWith('99999');
      expect(oddsRepo.insert).toHaveBeenCalledTimes(1);

      const rows = oddsRepo.insert.mock.calls[0][0];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: any) => r.bookmakerId === null)).toBe(true);

      const oneX2 = rows.filter((r: any) => r.marketType === '1X2');
      expect(oneX2).toHaveLength(9); // 3 bookmakers × 3 issues
      expect(result.snapshotsInserted).toBe(rows.length);
    });

    it('double chance : impliedProbabilityFair et overround restent NULL (non-partition)', async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        APIFOOTBALL_ODDS_SAMPLE[0],
      ]);

      await service.syncPrematchOdds();

      const rows = oddsRepo.insert.mock.calls[0][0];
      const doubleChance = rows.filter(
        (r: any) => r.marketType === 'DOUBLE_CHANCE',
      );
      expect(doubleChance).toHaveLength(3);
      expect(
        doubleChance.every((r: any) => r.impliedProbabilityFair === null),
      ).toBe(true);
      expect(doubleChance.every((r: any) => r.overround === null)).toBe(true);
      expect(
        doubleChance.every(
          (r: any) => typeof r.impliedProbabilityRaw === 'number',
        ),
      ).toBe(true);
    });

    it("ah+0.5 (paire structurellement incomplète) ne plante pas et n'insère aucune ligne pour ce marché", async () => {
      const fixture = makeFixture();
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchPrematchOdds.mockResolvedValue([
        APIFOOTBALL_ODDS_SAMPLE[1],
      ]);

      await expect(service.syncPrematchOdds()).resolves.toBeDefined();

      const rows = oddsRepo.insert.mock.calls[0][0];
      expect(rows.some((r: any) => r.marketType === 'AH_+0.5')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'odds_ingestion_incomplete_market',
          marketType: 'AH_+0.5',
        }),
        'OddsIngestionService',
      );
    });
  });

  describe('syncLiveOdds()', () => {
    it('interroge les fixtures en cours via le query builder', async () => {
      const fixture = makeFixture({ statusShort: '1H' });
      fixtureRepo._qb.getMany.mockResolvedValue([fixture]);
      apiClient.fetchLiveOdds.mockResolvedValue([]);

      const result = await service.syncLiveOdds();

      expect(fixtureRepo.createQueryBuilder).toHaveBeenCalledWith('fixture');
      expect(apiClient.fetchLiveOdds).toHaveBeenCalledWith('99999');
      expect(result.fixturesProcessed).toBe(1);
    });
  });

  describe('sélection des fixtures (vocabulaire normalisé)', () => {
    // Régression M1 : la sélection filtrait sur les libellés BRUTS apifootball
    // ('', 'Half Time', minutes en regex) alors que normalizeApifootballStatus
    // écrit en base le vocabulaire api-sports (NS/HT/LIVE/FT). Le prématch ne
    // sélectionnait jamais rien et la mi-temps était exclue du live — quel que
    // soit le provider, on filtre désormais sur les valeurs normalisées.
    it('prématch : sélectionne les fixtures NS (statut normalisé, tous providers)', async () => {
      fixtureRepo._qb.getMany.mockResolvedValue([]);

      await service.syncPrematchOdds();

      const [clause, params] = fixtureRepo._qb.where.mock.calls.at(-1);
      expect(clause).not.toContain("''");
      expect(params).toEqual({ status: 'NS' });
    });

    it('live : inclut HT (mi-temps) et LIVE, jamais les libellés bruts apifootball', async () => {
      fixtureRepo._qb.getMany.mockResolvedValue([]);

      await service.syncLiveOdds();

      const [clause, params] = fixtureRepo._qb.where.mock.calls.at(-1);
      expect(clause).not.toContain('REGEXP');
      expect(params.statuses).toEqual(
        expect.arrayContaining(['LIVE', 'HT', '1H', '2H']),
      );
      expect(params.statuses).not.toContain('Half Time');
      expect(params.statuses).not.toContain('Finished');
      expect(params.statuses).not.toContain('FT');
    });

    it('la sélection est identique quel que soit le provider résolu', async () => {
      fixtureRepo._qb.getMany.mockResolvedValue([]);

      apiClient.getProvider.mockReturnValue('apifootball');
      await service.syncLiveOdds();
      const apifootballCall = fixtureRepo._qb.where.mock.calls.at(-1);

      apiClient.getProvider.mockReturnValue('apisports');
      await service.syncLiveOdds();
      const apisportsCall = fixtureRepo._qb.where.mock.calls.at(-1);

      expect(apifootballCall).toEqual(apisportsCall);
    });
  });
});

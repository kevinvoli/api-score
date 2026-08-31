import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import {
  SmartRulesConfigService,
  DEFAULT_CONFIG,
} from '../settings/smart-rules-config.service';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { BaseRatesService } from '../analytics/base-rates.service';
import { JsonLogger } from '../common/json.logger';

// ── Factories ────────────────────────────────────────────────

function mockRepository() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findBy: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto: object) => dto),
    delete: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
    upsert: jest.fn(),
  };
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-uuid-1',
    providerFixtureId: '123456',
    leagueId: 39,
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
    lastSyncedAt: new Date(),
    events: [],
    statsSnapshots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Fixture;
}

function makeSmartCoupon(overrides: Partial<SmartCoupon> = {}): SmartCoupon {
  return {
    id: 'coupon-uuid-1',
    fixtureId: 'fixture-uuid-1',
    homeTeamName: 'PSG',
    awayTeamName: 'Lyon',
    teamId: 10,
    teamName: 'PSG',
    isHomeTeam: true,
    marketType: 'Buts match',
    selection: 'PSG marque dans le match (+0.5)',
    currentOdd: 1.45,
    minAcceptableOdd: 1.35,
    edgePct: 8.0,
    confidenceScore: 75,
    reasons: ['Forte pression offensive'],
    ruleName: 'shots-pressure',
    elapsedAtSuggestion: 30,
    shotsCount: 12,
    status: 'PENDING',
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SmartCoupon;
}

function makeStatsSnapshot(
  fixtureId: string,
  teamId: number,
  shots: number,
  elapsed = 30,
): FixtureStatsSnapshot {
  return {
    id: `snap-${teamId}`,
    fixtureId,
    teamId,
    half: null,
    elapsed,
    stats: {
      statistics: [{ type: 'Total Shots', value: shots }],
    },
    snapshotAt: new Date(),
    createdAt: new Date(),
    fixture: undefined as unknown as Fixture,
  } as FixtureStatsSnapshot;
}

// ── Setup commun ─────────────────────────────────────────────

describe('SmartSuggestionsService', () => {
  let service: SmartSuggestionsService;
  let fixtureRepo: ReturnType<typeof mockRepository>;
  let statsRepo: ReturnType<typeof mockRepository>;
  let recoRepo: ReturnType<typeof mockRepository>;
  let couponRepo: ReturnType<typeof mockRepository>;
  let configService: { getConfig: jest.Mock };
  let apiClient: { fetchAllLiveOdds: jest.Mock; fetchLiveFixtures?: jest.Mock };
  let baseRatesService: { buildLookup: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    fixtureRepo = mockRepository();
    statsRepo = mockRepository();
    recoRepo = mockRepository();
    couponRepo = mockRepository();

    configService = { getConfig: jest.fn().mockResolvedValue(DEFAULT_CONFIG) };
    apiClient = { fetchAllLiveOdds: jest.fn().mockResolvedValue(new Map()) };
    baseRatesService = {
      buildLookup: jest.fn().mockResolvedValue(new Map()),
    };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartSuggestionsService,
        { provide: getRepositoryToken(Fixture), useValue: fixtureRepo },
        {
          provide: getRepositoryToken(FixtureStatsSnapshot),
          useValue: statsRepo,
        },
        { provide: getRepositoryToken(BetRecommendation), useValue: recoRepo },
        { provide: getRepositoryToken(SmartCoupon), useValue: couponRepo },
        { provide: SmartRulesConfigService, useValue: configService },
        { provide: ApiFootballClient, useValue: apiClient },
        { provide: BaseRatesService, useValue: baseRatesService },
        { provide: JsonLogger, useValue: logger },
      ],
    }).compile();

    service = module.get<SmartSuggestionsService>(SmartSuggestionsService);
  });

  // ── Helpers pour QueryBuilder ─────────────────────────────

  function makeQbReturning(entities: unknown[]) {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(entities),
    };
    return qb;
  }

  // ── Tests evaluateAndSave() ───────────────────────────────

  describe('evaluateAndSave()', () => {
    /**
     * getAllSuggestions lance en parallèle getFirstHalfSuggestions et getSecondHalfSuggestions.
     * Chacune appelle fixtureRepo.createQueryBuilder avec l'alias 'f'.
     * On utilise mockResolvedValueOnce pour contrôler les résultats successifs
     * du même mock sans risque de race condition.
     */
    function setupEvaluateFixturesMocks(
      fixtureResults: Fixture[][],
      snapResults: FixtureStatsSnapshot[][],
    ) {
      // fixtureRepo.createQueryBuilder est appelé une fois pour 1H, une fois pour 2H
      fixtureRepo.createQueryBuilder.mockImplementation(() => {
        const qb = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn(),
        };
        qb.getMany
          .mockResolvedValueOnce(fixtureResults[0] ?? [])
          .mockResolvedValueOnce(fixtureResults[1] ?? []);
        return qb;
      });

      // statsRepo.createQueryBuilder : appelé pour chaque batch de snapshots
      let statsCall = -1;
      statsRepo.createQueryBuilder.mockImplementation(() => {
        statsCall++;
        const result = snapResults[statsCall] ?? [];
        return makeQbReturning(result);
      });
    }

    it('crée une suggestion quand la règle 1ère MT est déclenchée (minute=25, shots=12 ≥ seuil 10, maxElapsed=30)', async () => {
      // La règle { maxElapsed: 30, minShots: 10 } s'applique quand elapsed < 30 ET shots >= 10
      const fixture = makeFixture({ elapsed: 25, statusShort: '1H' });
      const snap = makeStatsSnapshot(fixture.id, 10, 12);

      // 1er appel fixtureRepo → fixtures 1H ; 2e appel → fixtures 2H (vide)
      // 1er appel statsRepo → snapshots pour evaluateFixtures 1H
      setupEvaluateFixturesMocks([[fixture], []], [[snap]]);

      couponRepo.findOne.mockResolvedValue(null);
      couponRepo.find.mockResolvedValue([]);
      recoRepo.delete.mockResolvedValue({});
      recoRepo.save.mockResolvedValue([]);
      couponRepo.save.mockResolvedValue({});

      await service.evaluateAndSave();

      expect(recoRepo.save).toHaveBeenCalled();
      const savedEntities: unknown[] = recoRepo.save.mock.calls[0][0];
      expect(savedEntities.length).toBeGreaterThanOrEqual(1);
    });

    it("branche confidenceScore sur le taux de base réel (%) et sa taille d'échantillon", async () => {
      const fixture = makeFixture({ elapsed: 25, statusShort: '1H' });
      const snap = makeStatsSnapshot(fixture.id, 10, 12);
      setupEvaluateFixturesMocks([[fixture], []], [[snap]]);

      // Taux réel seulement pour goal_1h au seuil 10 (leagueId 39, saison 2024).
      // goal_ft (Buts match) au même seuil n'a pas de taux → confidence null.
      baseRatesService.buildLookup.mockResolvedValue(
        new Map([
          ['39|2024|goal_1h|10', { observedRate: 0.68, sampleSize: 340 }],
        ]),
      );

      couponRepo.findOne.mockResolvedValue(null);
      couponRepo.find.mockResolvedValue([]);
      recoRepo.delete.mockResolvedValue({});
      recoRepo.save.mockResolvedValue([]);
      couponRepo.save.mockResolvedValue({});

      await service.evaluateAndSave();

      const saved: Array<{
        marketType: string;
        confidenceScore: number | null;
        baseRateSampleSize: number | null;
      }> = recoRepo.save.mock.calls[0][0];

      const firstHalf = saved.find(
        (s) => s.marketType === 'Buts 1ère mi-temps',
      );
      expect(firstHalf).toMatchObject({
        confidenceScore: 68,
        baseRateSampleSize: 340,
      });

      const fullMatch = saved.find((s) => s.marketType === 'Buts match');
      expect(fullMatch).toMatchObject({
        confidenceScore: null,
        baseRateSampleSize: null,
      });
    });

    it('ne crée aucune suggestion quand shots insuffisants (shots=5, seuil=10 à elapsed=25)', async () => {
      // elapsed=25 correspond à la règle { maxElapsed: 30, minShots: 10 } mais shots=5 < 10
      const fixture = makeFixture({ elapsed: 25, statusShort: '1H' });
      const snap = makeStatsSnapshot(fixture.id, 10, 5);

      setupEvaluateFixturesMocks([[fixture], []], [[snap]]);
      couponRepo.find.mockResolvedValue([]);

      await service.evaluateAndSave();

      expect(recoRepo.save).not.toHaveBeenCalled();
      expect(recoRepo.delete).not.toHaveBeenCalled();
    });

    it('ne recrée pas un coupon déjà résolu pour le même (fixture, équipe, marché)', async () => {
      // Régression : la déduplication ne regardait que les PENDING — un coupon
      // passé WON sortait du filtre et la même suggestion, toujours active au
      // tick suivant, recréait indéfiniment le même pari (Majd FC observé ×4).
      const fixture = makeFixture({ elapsed: 25, statusShort: '1H' });
      const snap = makeStatsSnapshot(fixture.id, 10, 12);
      setupEvaluateFixturesMocks([[fixture], []], [[snap]]);

      // La règle 1re MT émet deux suggestions (mi-temps + match entier) :
      // les deux paris existent déjà, résolus WON.
      couponRepo.findBy.mockResolvedValue([
        {
          fixtureId: fixture.id,
          teamId: 10,
          marketType: 'Buts 1ère mi-temps',
          status: 'WON',
        },
        {
          fixtureId: fixture.id,
          teamId: 10,
          marketType: 'Buts match',
          status: 'WON',
        },
      ]);
      couponRepo.find.mockResolvedValue([]);
      recoRepo.delete.mockResolvedValue({});
      recoRepo.save.mockResolvedValue([]);

      await service.evaluateAndSave();

      expect(couponRepo.findBy).toHaveBeenCalledWith({
        fixtureId: expect.anything(),
      });
      expect(couponRepo.save).not.toHaveBeenCalled();
    });

    it('exécute resolveSettledCoupons même si la génération de suggestions échoue', async () => {
      // Forcer une erreur dans getAllSuggestions
      configService.getConfig.mockRejectedValue(new Error('DB error'));

      // resolveSettledCoupons doit tout de même s'exécuter (bloc finally)
      couponRepo.find.mockResolvedValue([]);

      // L'erreur est propagée (pas de catch dans evaluateAndSave)
      await expect(service.evaluateAndSave()).rejects.toThrow('DB error');

      // Mais resolveSettledCoupons a été appelé dans le finally
      expect(couponRepo.find).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
    });
  });

  // ── Tests resolveSettledCoupons() ─────────────────────────

  describe('resolveSettledCoupons()', () => {
    it('passe coupon PENDING → WON quand fixture terminée et équipe a marqué (Buts match)', async () => {
      const fixture = makeFixture({
        statusShort: 'FT',
        scoreHome: 2,
        scoreAway: 0,
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts match',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'WON' });

      await service.resolveSettledCoupons();

      expect(couponRepo.save).toHaveBeenCalledTimes(1);
      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('WON');
      expect(saved.resolvedAt).toBeInstanceOf(Date);
    });

    it("passe coupon PENDING → LOST quand fixture terminée et équipe n'a pas marqué (Buts match)", async () => {
      const fixture = makeFixture({
        statusShort: 'FT',
        scoreHome: 0,
        scoreAway: 1,
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts match',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'LOST' });

      await service.resolveSettledCoupons();

      expect(couponRepo.save).toHaveBeenCalledTimes(1);
      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('LOST');
    });

    it("laisse coupon PENDING si la fixture n'est pas encore terminée", async () => {
      const fixture = makeFixture({
        statusShort: '1H',
        scoreHome: 0,
        scoreAway: 0,
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts match',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);

      await service.resolveSettledCoupons();

      // Aucune résolution car le match est en cours et score = 0
      expect(couponRepo.save).not.toHaveBeenCalled();
    });

    it("ne lève pas d'exception quand il n'y a aucun coupon PENDING", async () => {
      couponRepo.find.mockResolvedValue([]);

      await expect(service.resolveSettledCoupons()).resolves.toBeUndefined();
      expect(fixtureRepo.findBy).not.toHaveBeenCalled();
    });

    it('passe coupon → WON immédiatement si score > 0 pendant le match (Buts match)', async () => {
      const fixture = makeFixture({
        statusShort: '1H',
        scoreHome: 1,
        scoreAway: 0,
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts match',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'WON' });

      await service.resolveSettledCoupons();

      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('WON');
    });

    it('passe coupon → WON pour Buts 1ère mi-temps quand score HT > 0 (api-sports format)', async () => {
      const fixture = makeFixture({
        statusShort: 'HT',
        scoreHome: 1,
        scoreAway: 0,
        raw: { score: { halftime: { home: 1, away: 0 } } },
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts 1ère mi-temps',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'WON' });

      await service.resolveSettledCoupons();

      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('WON');
    });

    it('passe coupon → LOST pour Buts 1ère mi-temps quand score HT = 0 à la fin du match', async () => {
      const fixture = makeFixture({
        statusShort: 'FT',
        scoreHome: 0,
        scoreAway: 0,
        raw: { score: { halftime: { home: 0, away: 0 } } },
      });
      const coupon = makeSmartCoupon({
        marketType: 'Buts 1ère mi-temps',
        isHomeTeam: true,
        status: 'PENDING',
      });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'LOST' });

      await service.resolveSettledCoupons();

      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('LOST');
    });

    it('passe coupon → LOST pour un match annulé (CANC)', async () => {
      const fixture = makeFixture({ statusShort: 'CANC' });
      const coupon = makeSmartCoupon({ status: 'PENDING' });

      couponRepo.find.mockResolvedValue([coupon]);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({ ...coupon, status: 'LOST' });

      await service.resolveSettledCoupons();

      const saved = couponRepo.save.mock.calls[0][0] as SmartCoupon;
      expect(saved.status).toBe('LOST');
    });
  });

  // ── Idempotence ───────────────────────────────────────────

  describe('idempotence de saveCoupons', () => {
    it('ne crée pas de doublon si un coupon PENDING identique existe déjà', async () => {
      const fixture = makeFixture({ elapsed: 30, statusShort: '1H' });
      const snap = makeStatsSnapshot(fixture.id, 10, 12);

      fixtureRepo.createQueryBuilder.mockImplementation(() => {
        const qb = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn(),
        };
        qb.getMany.mockResolvedValueOnce([fixture]).mockResolvedValueOnce([]);
        return qb;
      });
      statsRepo.createQueryBuilder.mockImplementation(() =>
        makeQbReturning([snap]),
      );

      // Un coupon PENDING identique existe déjà
      couponRepo.findOne.mockResolvedValue(makeSmartCoupon());
      couponRepo.find.mockResolvedValue([]);
      recoRepo.delete.mockResolvedValue({});
      recoRepo.save.mockResolvedValue([]);

      await service.evaluateAndSave();

      // couponRepo.save ne doit pas être appelé pour éviter les doublons
      expect(couponRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── Cas limite : fixture sans stats ──────────────────────

  describe('cas limites', () => {
    function makeQbOnce(first: unknown[], second: unknown[]) {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };
      qb.getMany.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      return qb;
    }

    it("ne lève pas d'exception si une fixture n'a aucun snapshot de stats", async () => {
      const fixture = makeFixture({ elapsed: 30, statusShort: '1H' });

      fixtureRepo.createQueryBuilder.mockImplementation(() =>
        makeQbOnce([fixture], []),
      );
      statsRepo.createQueryBuilder.mockImplementation(() =>
        makeQbReturning([]),
      );
      couponRepo.find.mockResolvedValue([]);

      await expect(service.evaluateAndSave()).resolves.toBeUndefined();
    });

    it("ne lève pas d'exception si stats est vide dans le snapshot", async () => {
      const fixture = makeFixture({ elapsed: 30, statusShort: '1H' });
      const snapWithEmptyStats = {
        ...makeStatsSnapshot(fixture.id, 10, 0),
        stats: {},
      } as FixtureStatsSnapshot;

      fixtureRepo.createQueryBuilder.mockImplementation(() =>
        makeQbOnce([fixture], []),
      );
      statsRepo.createQueryBuilder.mockImplementation(() =>
        makeQbReturning([snapWithEmptyStats]),
      );
      couponRepo.find.mockResolvedValue([]);

      await expect(service.evaluateAndSave()).resolves.toBeUndefined();
    });
  });

  // ── getCouponHistory ──────────────────────────────────────

  describe('getCouponHistory()', () => {
    it('retourne data et total avec les valeurs paginées par défaut', async () => {
      const coupons = [makeSmartCoupon(), makeSmartCoupon({ id: 'coupon-2' })];
      couponRepo.findAndCount.mockResolvedValue([coupons, 2]);

      const result = await service.getCouponHistory();

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('respecte les paramètres limit et offset', async () => {
      couponRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getCouponHistory(10, 20);

      expect(couponRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  // ── Détection N+1 ─────────────────────────────────────────

  describe('performance — pas de N+1', () => {
    it("ne fait qu'un seul appel findBy pour toutes les fixtures des coupons PENDING", async () => {
      const coupons = [
        makeSmartCoupon({ fixtureId: 'fixture-uuid-1' }),
        makeSmartCoupon({ id: 'coupon-2', fixtureId: 'fixture-uuid-1' }),
      ];
      const fixture = makeFixture({
        statusShort: 'FT',
        scoreHome: 0,
        scoreAway: 0,
      });

      couponRepo.find.mockResolvedValue(coupons);
      fixtureRepo.findBy.mockResolvedValue([fixture]);
      couponRepo.save.mockResolvedValue({});

      await service.resolveSettledCoupons();

      // Un seul findBy même pour plusieurs coupons de la même fixture
      expect(fixtureRepo.findBy).toHaveBeenCalledTimes(1);
    });
  });
});

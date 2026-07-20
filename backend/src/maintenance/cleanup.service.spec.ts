import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { JsonLogger } from '../common/json.logger';
import { CleanupService } from './cleanup.service';

function mockRepository() {
  return {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

describe('CleanupService', () => {
  let service: CleanupService;
  let fixtureRepo: ReturnType<typeof mockRepository>;
  let payloadRepo: ReturnType<typeof mockRepository>;
  let recoRepo: ReturnType<typeof mockRepository>;
  let couponRepo: ReturnType<typeof mockRepository>;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    fixtureRepo = mockRepository();
    payloadRepo = mockRepository();
    recoRepo = mockRepository();
    couponRepo = mockRepository();
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    configService = {
      get: jest.fn((_key: string, defaultValue?: number) => defaultValue),
    };

    const module = await Test.createTestingModule({
      providers: [
        CleanupService,
        { provide: JsonLogger, useValue: logger },
        { provide: ConfigService, useValue: configService },
        {
          provide: getRepositoryToken(ApiFootballPayload),
          useValue: payloadRepo,
        },
        { provide: getRepositoryToken(Fixture), useValue: fixtureRepo },
        { provide: getRepositoryToken(BetRecommendation), useValue: recoRepo },
        { provide: getRepositoryToken(SmartCoupon), useValue: couponRepo },
      ],
    }).compile();

    service = module.get(CleanupService);
  });

  it('supprime les recos NEW et coupons PENDING des fixtures mortes uniquement', async () => {
    fixtureRepo.find.mockResolvedValue([
      { id: 'f-morte-1' },
      { id: 'f-morte-2' },
    ]);
    recoRepo.delete.mockResolvedValue({ affected: 103 });
    couponRepo.delete.mockResolvedValue({ affected: 5 });

    await service.purgeStaleBettingArtifacts();

    expect(recoRepo.delete).toHaveBeenCalledWith({
      status: 'NEW',
      fixtureId: In(['f-morte-1', 'f-morte-2']),
    });
    expect(couponRepo.delete).toHaveBeenCalledWith({
      status: 'PENDING',
      fixtureId: In(['f-morte-1', 'f-morte-2']),
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'stale_betting_artifacts_purged',
        recommendationsDeleted: 103,
        couponsDeleted: 5,
      }),
      'CleanupService',
    );
  });

  it('ne touche jamais aux statuts résolus (WON/LOST) ni aux fixtures fraîches', async () => {
    fixtureRepo.find.mockResolvedValue([{ id: 'f-morte-1' }]);

    await service.purgeStaleBettingArtifacts();

    // Seuls NEW et PENDING sont ciblés — l'historique résolu est préservé.
    expect(recoRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'NEW' }),
    );
    expect(couponRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
    // La sélection des fixtures mortes passe par un seuil d'ancienneté.
    const criteria = fixtureRepo.find.mock.calls[0][0];
    expect(criteria.where.lastSyncedAt).toBeDefined();
  });

  it('aucune fixture morte → aucune suppression, aucun log', async () => {
    fixtureRepo.find.mockResolvedValue([]);

    await service.purgeStaleBettingArtifacts();

    expect(recoRepo.delete).not.toHaveBeenCalled();
    expect(couponRepo.delete).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('rien de supprimé → pas de log parasite', async () => {
    fixtureRepo.find.mockResolvedValue([{ id: 'f-morte-1' }]);
    recoRepo.delete.mockResolvedValue({ affected: 0 });
    couponRepo.delete.mockResolvedValue({ affected: 0 });

    await service.purgeStaleBettingArtifacts();

    expect(logger.log).not.toHaveBeenCalled();
  });

  describe('cleanupOldData() — rétentions séparées', () => {
    /** Extrait la borne temporelle passée à LessThan dans le critère de suppression. */
    const cutoffOf = (
      repo: ReturnType<typeof mockRepository>,
      field: string,
    ) => {
      const criteria = repo.count.mock.calls[0][0].where;
      return (criteria[field] as { value: Date }).value;
    };

    it('applique une rétention BEAUCOUP plus longue aux fixtures qu’aux payloads', async () => {
      payloadRepo.count.mockResolvedValue(5);
      fixtureRepo.count.mockResolvedValue(5);

      await service.cleanupOldData();

      const payloadCutoff = cutoffOf(payloadRepo, 'fetchedAt');
      const fixtureCutoff = cutoffOf(fixtureRepo, 'matchDate');
      const daysApart =
        (payloadCutoff.getTime() - fixtureCutoff.getTime()) / 86_400_000;

      // Régression 20/07/2026 : une rétention unique de 90 jours avait effacé
      // 268 fixtures, 3 554 snapshots et 1 319 événements.
      expect(Math.round(daysApart)).toBe(1095 - 90);
    });

    it('conserve les matchs vieux de 2 ans (l’import historique doit survivre)', async () => {
      payloadRepo.count.mockResolvedValue(0);
      fixtureRepo.count.mockResolvedValue(0);

      await service.cleanupOldData();

      const fixtureCutoff = cutoffOf(fixtureRepo, 'matchDate');
      const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000);
      expect(fixtureCutoff.getTime()).toBeLessThan(twoYearsAgo.getTime());
    });

    it('respecte les durées configurées par variables d’environnement', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'DATA_RETENTION_DAYS' ? 2000 : 30,
      );
      payloadRepo.count.mockResolvedValue(1);
      fixtureRepo.count.mockResolvedValue(1);

      await service.cleanupOldData();

      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cleanup_completed',
          dataRetentionDays: 2000,
          payloadRetentionDays: 30,
        }),
        'CleanupService',
      );
    });

    it('journalise un warn avant toute suppression massive', async () => {
      payloadRepo.count.mockResolvedValue(5000);
      fixtureRepo.count.mockResolvedValue(3);
      payloadRepo.delete.mockResolvedValue({ affected: 5000 });

      await service.cleanupOldData();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cleanup_mass_deletion',
          table: 'api_football_payloads',
          rows: 5000,
        }),
        'CleanupService',
      );
    });

    it('ne supprime rien quand il n’y a rien à supprimer', async () => {
      payloadRepo.count.mockResolvedValue(0);
      fixtureRepo.count.mockResolvedValue(0);

      await service.cleanupOldData();

      expect(payloadRepo.delete).not.toHaveBeenCalled();
      expect(fixtureRepo.delete).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});

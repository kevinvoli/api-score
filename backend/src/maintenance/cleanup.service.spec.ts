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
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

describe('CleanupService — purgeStaleBettingArtifacts()', () => {
  let service: CleanupService;
  let fixtureRepo: ReturnType<typeof mockRepository>;
  let recoRepo: ReturnType<typeof mockRepository>;
  let couponRepo: ReturnType<typeof mockRepository>;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    fixtureRepo = mockRepository();
    recoRepo = mockRepository();
    couponRepo = mockRepository();
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CleanupService,
        { provide: JsonLogger, useValue: logger },
        {
          provide: getRepositoryToken(ApiFootballPayload),
          useValue: mockRepository(),
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
});

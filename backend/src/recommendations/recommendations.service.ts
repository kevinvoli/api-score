import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { GetLiveRecommendationsQueryDto } from './dto/get-live-recommendations-query.dto';

// Statuts normalisés d'un match en cours (cf. normalizeApifootballStatus).
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'];

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(BetRecommendation)
    private readonly recommendationsRepository: Repository<BetRecommendation>,
  ) {}

  async getLiveRecommendations(query: GetLiveRecommendationsQueryDto): Promise<{
    items: BetRecommendation[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Une recommandation « live » n'est servie que si son match est encore
    // en cours ET synchronisé récemment : les lignes NEW n'expirent jamais en
    // base, sans ce garde-fou l'endpoint présentait des paris sur des matchs
    // terminés depuis des mois (fixtures figées par une sync interrompue).
    const qb = this.recommendationsRepository
      .createQueryBuilder('recommendation')
      .innerJoin(Fixture, 'f', 'f.id = recommendation.fixtureId')
      .andWhere('f.statusShort IN (:...liveStatuses)', {
        liveStatuses: LIVE_STATUSES,
      })
      .andWhere('f.lastSyncedAt >= :freshAfter', {
        freshAfter: new Date(Date.now() - 120_000),
      })
      .orderBy('recommendation.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.fixtureId) {
      qb.andWhere('recommendation.fixtureId = :fixtureId', {
        fixtureId: query.fixtureId,
      });
    }

    if (query.status) {
      qb.andWhere('recommendation.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, page, limit, total };
  }

  async getRecommendationById(id: string): Promise<BetRecommendation | null> {
    return this.recommendationsRepository.findOne({ where: { id } });
  }
}

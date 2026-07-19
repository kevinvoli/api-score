import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { GetLiveRecommendationsQueryDto } from './dto/get-live-recommendations-query.dto';

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

    const qb = this.recommendationsRepository
      .createQueryBuilder('recommendation')
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

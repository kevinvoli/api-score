import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fixture } from '../database/entities/fixture.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { GetOddsHistoryQueryDto } from './dto/get-odds-history-query.dto';

export interface LatestOddsResponse {
  fixtureId: string;
  providerFixtureId: number;
  odds: OddsSnapshot[];
}

export interface OddsHistoryResponse {
  fixtureId: string;
  providerFixtureId: number;
  items: OddsSnapshot[];
}

@Injectable()
export class OddsService {
  constructor(
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(OddsSnapshot)
    private readonly oddsSnapshotRepository: Repository<OddsSnapshot>,
  ) {}

  async getLatestOdds(providerFixtureId: number): Promise<LatestOddsResponse> {
    const fixture = await this.findFixtureOrFail(providerFixtureId);

    const rows = await this.oddsSnapshotRepository.find({
      where: { fixtureId: fixture.id },
      order: { capturedAt: 'DESC' },
    });

    return {
      fixtureId: fixture.id,
      providerFixtureId,
      odds: this.keepLatestPerGroup(rows),
    };
  }

  async getOddsHistory(
    providerFixtureId: number,
    query: GetOddsHistoryQueryDto,
  ): Promise<OddsHistoryResponse> {
    const fixture = await this.findFixtureOrFail(providerFixtureId);

    const qb = this.oddsSnapshotRepository
      .createQueryBuilder('odds')
      .where('odds.fixtureId = :fixtureId', { fixtureId: fixture.id });

    if (query.marketType) {
      qb.andWhere('odds.marketType = :marketType', {
        marketType: query.marketType,
      });
    }

    if (query.bookmakerId !== undefined) {
      qb.andWhere('odds.bookmakerId = :bookmakerId', {
        bookmakerId: query.bookmakerId,
      });
    }

    qb.orderBy('odds.capturedAt', 'ASC');
    qb.take(query.limit ?? 200);

    const items = await qb.getMany();

    return { fixtureId: fixture.id, providerFixtureId, items };
  }

  private async findFixtureOrFail(providerFixtureId: number): Promise<Fixture> {
    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: providerFixtureId.toString() },
    });

    if (!fixture) {
      throw new NotFoundException(`Fixture ${providerFixtureId} introuvable`);
    }

    return fixture;
  }

  /** Ne garde que la ligne la plus récente par (bookmaker, marché, issue). */
  private keepLatestPerGroup(rows: OddsSnapshot[]): OddsSnapshot[] {
    const latestByKey = new Map<string, OddsSnapshot>();

    for (const row of rows) {
      const key = `${row.bookmakerId}:${row.marketType}:${row.outcome}`;
      if (!latestByKey.has(key)) {
        latestByKey.set(key, row);
      }
    }

    return Array.from(latestByKey.values());
  }
}

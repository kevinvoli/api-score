import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { GetPayloadsQueryDto } from './dto/get-payloads-query.dto';

@Injectable()
export class ArchiveService {
  constructor(
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
  ) {}

  async getPayloads(query: GetPayloadsQueryDto): Promise<{
    items: ApiFootballPayload[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const where: FindOptionsWhere<ApiFootballPayload> = {};
    if (query.endpoint) {
      where.endpoint = query.endpoint;
    }
    if (query.matchId) {
      where.matchId = query.matchId;
    }
    if (query.leagueId !== undefined) {
      where.leagueId = query.leagueId;
    }
    if (query.teamId !== undefined) {
      where.teamId = query.teamId;
    }

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date(0);
      const to = query.to ? new Date(query.to) : new Date();
      where.fetchedAt = Between(from, to);
    }

    const [items, total] = await this.payloadRepository.findAndCount({
      where,
      order: { fetchedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, page, limit, total };
  }
}

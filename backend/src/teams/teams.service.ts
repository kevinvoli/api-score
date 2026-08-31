import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../database/entities/team.entity';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
  ) {}

  async getTeams(query: { leagueId?: number; limit?: number }) {
    const limit = query.limit ?? 100;
    const qb = this.teamRepository
      .createQueryBuilder('team')
      .orderBy('team.name', 'ASC');
    if (query.leagueId !== undefined) {
      qb.andWhere('team.leagueId = :leagueId', { leagueId: query.leagueId });
    }
    qb.take(limit);
    const items = await qb.getMany();
    return { items, limit };
  }

  async getTeamByKey(teamKey: number) {
    return this.teamRepository.findOne({ where: { teamKey } });
  }
}

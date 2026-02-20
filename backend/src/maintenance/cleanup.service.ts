import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { JsonLogger } from '../common/json.logger';

@Injectable()
export class CleanupService {
  constructor(
    private readonly logger: JsonLogger,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldData(): Promise<void> {
    const retentionDays = 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const payloadResult = await this.payloadRepository.delete({
      fetchedAt: LessThan(cutoff),
    });

    const fixturesResult = await this.fixtureRepository.delete({
      matchDate: LessThan(cutoff),
    });

    this.logger.log(
      {
        event: 'cleanup_completed',
        retentionDays,
        payloadsDeleted: payloadResult.affected ?? 0,
        fixturesDeleted: fixturesResult.affected ?? 0,
      },
      'CleanupService',
    );
  }
}

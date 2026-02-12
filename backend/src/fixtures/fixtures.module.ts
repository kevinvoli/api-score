import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureLineup } from '../database/entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from '../database/entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';
import { FixturesController } from './fixtures.controller';
import { FixturesIngestionService } from './fixtures-ingestion.service';
import { FixturesSyncScheduler } from './fixtures-sync.scheduler';

@Module({
  imports: [
    ProviderApiFootballModule,
    TypeOrmModule.forFeature([
      ApiUsageLog,
      Fixture,
      FixtureEvent,
      FixtureLineup,
      FixturePlayerStatsSnapshot,
      FixtureStatsSnapshot,
    ]),
  ],
  controllers: [FixturesController],
  providers: [FixturesIngestionService, FixturesSyncScheduler],
  exports: [FixturesIngestionService],
})
export class FixturesModule {}

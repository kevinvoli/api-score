import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureLineup } from '../database/entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from '../database/entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { Team } from '../database/entities/team.entity';
import { Country } from '../database/entities/country.entity';
import { League } from '../database/entities/league.entity';
import { Match } from '../database/entities/match.entity';
import { Standing } from '../database/entities/standing.entity';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { FixturesController } from './fixtures.controller';
import { FixturesIngestionService } from './fixtures-ingestion.service';
import { FixturesSyncScheduler } from './fixtures-sync.scheduler';
import { ProviderController } from './provider.controller';
import { ProviderPersistenceService } from './provider-persistence.service';

@Module({
  imports: [
    ProviderApiFootballModule,
    RecommendationsModule,
    TypeOrmModule.forFeature([
      ApiUsageLog,
      ApiFootballPayload,
      Fixture,
      FixtureEvent,
      FixtureLineup,
      FixturePlayerStatsSnapshot,
      FixtureStatsSnapshot,
      Match,
      Team,
      Country,
      League,
      Standing,
    ]),
  ],
  controllers: [FixturesController, ProviderController],
  providers: [FixturesIngestionService, FixturesSyncScheduler, ProviderPersistenceService],
  exports: [FixturesIngestionService],
})
export class FixturesModule {}

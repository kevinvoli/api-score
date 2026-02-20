import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { ApiFootballPayload } from './entities/api-football-payload.entity';
import { AppRuntimeState } from './entities/app-runtime-state.entity';
import { FixtureAnalytics } from './entities/fixture-analytics.entity';
import { FixtureEvent } from './entities/fixture-event.entity';
import { FixtureLineup } from './entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from './entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from './entities/fixture-stats-snapshot.entity';
import { Fixture } from './entities/fixture.entity';
import { BetRecommendation } from './entities/bet-recommendation.entity';
import { Team } from './entities/team.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        url: configService.get<string>('DB_URL'),
        entities: [
        ApiUsageLog,
        ApiFootballPayload,
        AppRuntimeState,
        FixtureAnalytics,
        BetRecommendation,
        Team,
        Fixture,
        FixtureEvent,
        FixtureLineup,
        FixturePlayerStatsSnapshot,
        FixtureStatsSnapshot,
        ],
        autoLoadEntities: true,
        synchronize: false,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([
      ApiUsageLog,
      ApiFootballPayload,
      AppRuntimeState,
      FixtureAnalytics,
      BetRecommendation,
      Team,
      Fixture,
      FixtureEvent,
      FixtureLineup,
      FixturePlayerStatsSnapshot,
      FixtureStatsSnapshot,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}


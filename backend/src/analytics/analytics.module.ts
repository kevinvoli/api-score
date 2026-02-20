import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FixtureAnalytics } from '../database/entities/fixture-analytics.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FixtureAnalytics,
      Fixture,
      FixtureStatsSnapshot,
      FixtureEvent,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}

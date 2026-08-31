import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseRate } from '../database/entities/base-rate.entity';
import { FixtureAnalytics } from '../database/entities/fixture-analytics.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { BaseRatesService } from './base-rates.service';
import { BaseRatesScheduler } from './base-rates.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FixtureAnalytics,
      Fixture,
      FixtureStatsSnapshot,
      FixtureEvent,
      BaseRate,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, BaseRatesService, BaseRatesScheduler],
  exports: [BaseRatesService],
})
export class AnalyticsModule {}

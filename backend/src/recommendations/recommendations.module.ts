import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';
import { SettingsModule } from '../settings/settings.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { SmartSuggestionsService } from './smart-suggestions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BetRecommendation,
      Fixture,
      FixtureStatsSnapshot,
      SmartCoupon,
    ]),
    ProviderApiFootballModule,
    SettingsModule,
    AnalyticsModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, SmartSuggestionsService],
  exports: [SmartSuggestionsService],
})
export class RecommendationsModule {}

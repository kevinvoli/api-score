import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { SmartSuggestionsService } from './smart-suggestions.service';

@Module({
  imports: [TypeOrmModule.forFeature([BetRecommendation, Fixture, FixtureStatsSnapshot])],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, SmartSuggestionsService],
  exports:   [SmartSuggestionsService],
})
export class RecommendationsModule {}

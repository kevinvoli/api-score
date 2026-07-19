import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiFootballPayload,
      Fixture,
      BetRecommendation,
      SmartCoupon,
    ]),
  ],
  providers: [CleanupService],
})
export class MaintenanceModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { BacktestEngineService } from './backtest-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BacktestRun,
      BetResult,
      Fixture,
      FixtureStatsSnapshot,
      ApiFootballPayload,
    ]),
  ],
  providers: [BacktestEngineService],
  exports: [BacktestEngineService, TypeOrmModule],
})
export class BacktestModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { WalkForwardFold } from '../database/entities/walk-forward-fold.entity';
import { WalkForwardRun } from '../database/entities/walk-forward-run.entity';
import { BacktestEngineService } from './backtest-engine.service';
import { WalkForwardService } from './walk-forward.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BacktestRun,
      BetResult,
      Fixture,
      FixtureEvent,
      FixtureStatsSnapshot,
      ApiFootballPayload,
      WalkForwardRun,
      WalkForwardFold,
    ]),
  ],
  providers: [BacktestEngineService, WalkForwardService],
  exports: [BacktestEngineService, WalkForwardService, TypeOrmModule],
})
export class BacktestModule {}

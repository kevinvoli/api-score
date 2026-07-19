import { ApiFootballPayload } from './api-football-payload.entity';
import { ApiUsageLog } from './api-usage-log.entity';
import { AppRuntimeState } from './app-runtime-state.entity';
import { BacktestRun } from './backtest-run.entity';
import { BetRecommendation } from './bet-recommendation.entity';
import { BetResult } from './bet-result.entity';
import { Country } from './country.entity';
import { Fixture } from './fixture.entity';
import { FixtureAnalytics } from './fixture-analytics.entity';
import { FixtureEvent } from './fixture-event.entity';
import { FixtureLineup } from './fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from './fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from './fixture-stats-snapshot.entity';
import { League } from './league.entity';
import { Match } from './match.entity';
import { OddsSnapshot } from './odds-snapshot.entity';
import { SmartCoupon } from './smart-coupon.entity';
import { Standing } from './standing.entity';
import { Team } from './team.entity';

export const ALL_ENTITIES = [
  ApiFootballPayload,
  ApiUsageLog,
  AppRuntimeState,
  BacktestRun,
  BetRecommendation,
  BetResult,
  Country,
  Fixture,
  FixtureAnalytics,
  FixtureEvent,
  FixtureLineup,
  FixturePlayerStatsSnapshot,
  FixtureStatsSnapshot,
  League,
  Match,
  OddsSnapshot,
  SmartCoupon,
  Standing,
  Team,
];

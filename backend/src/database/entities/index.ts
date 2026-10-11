import { ApiFootballPayload } from './api-football-payload.entity';
import { ApiUsageLog } from './api-usage-log.entity';
import { AppRuntimeState } from './app-runtime-state.entity';
import { BacktestRun } from './backtest-run.entity';
import { BaseRate } from './base-rate.entity';
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
import { LeagueWatchlist } from './league-watchlist.entity';
import { Match } from './match.entity';
import { OddsSnapshot } from './odds-snapshot.entity';
import { SmartCoupon } from './smart-coupon.entity';
import { Standing } from './standing.entity';
import { Team } from './team.entity';
import { AuthUser } from './auth-user.entity';
import { AuthSession } from './auth-session.entity';
import { OperationAuditEvent } from './operation-audit-event.entity';
import { AuthLoginAttempt } from './auth-login-attempt.entity';
import { WalkForwardRun } from './walk-forward-run.entity';
import { WalkForwardFold } from './walk-forward-fold.entity';
import { SimulationRun } from './simulation-run.entity';
import { BetDecision } from './bet-decision.entity';
import { ExecutionControl } from './execution-control.entity';
import { RiskPolicy } from './risk-policy.entity';
import { ExecutionGateEvidence } from './execution-gate-evidence.entity';
import { BankrollAccount } from './bankroll-account.entity';
import { BankrollLedgerEntry } from './bankroll-ledger-entry.entity';
import { BetOrder } from './bet-order.entity';
import { BetReceipt } from './bet-receipt.entity';
import { ReconciliationRun } from './reconciliation-run.entity';
import { ReconciliationItem } from './reconciliation-item.entity';

export const ALL_ENTITIES = [
  ApiFootballPayload,
  ApiUsageLog,
  AppRuntimeState,
  BacktestRun,
  BaseRate,
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
  LeagueWatchlist,
  Match,
  OddsSnapshot,
  SmartCoupon,
  Standing,
  Team,
  AuthUser,
  AuthSession,
  OperationAuditEvent,
  AuthLoginAttempt,
  WalkForwardRun,
  WalkForwardFold,
  SimulationRun,
  BetDecision,
  ExecutionControl,
  RiskPolicy,
  ExecutionGateEvidence,
  BankrollAccount,
  BankrollLedgerEntry,
  BetOrder,
  BetReceipt,
  ReconciliationRun,
  ReconciliationItem,
];

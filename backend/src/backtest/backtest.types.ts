import { SmartRulesConfig } from '../settings/smart-rules-config.service';

export type OddsSource = 'ODDS_SNAPSHOT' | 'LIVE_PAYLOAD' | 'STRATEGY_DEFAULT';

export interface BacktestStrategy {
  name: string;
  version: string;
  /** Réutilise le type de config du live → la baseline exécute les règles EXACTES du live. */
  entryRules: SmartRulesConfig;
  markets: string[];
  minEdgePct: number;
  minConfidence: number;
  staking: { type: 'FLAT' | 'PERCENT_BANKROLL'; amount: number };
  odds: {
    /** Chaîne de fallback ordonnée pour la cote au moment de la décision. */
    source: OddsSource[];
    /** Décision à T, cote prise à T + latence (exécution réaliste). */
    executionLatencyMs: number;
  };
  bankroll: number;
}

export type BetOutcome = 'WON' | 'LOST' | 'NO_RESULT';

/** Pari décidé par le rejeu, avant staking (stake/profit calculés par le calculateur de KPIs). */
export interface DecidedBet {
  fixtureId: string;
  providerFixtureId: string;
  marketType: string;
  selection: string;
  ruleName: string | null;
  teamId: number | null;
  isHomeTeam: boolean;
  decisionAt: Date;
  elapsedAtDecision: number | null;
  oddAtDecision: number;
  oddSource: OddsSource;
  edgePct: number | null;
  confidenceScore: number | null;
  outcome: BetOutcome;
}

export interface StakedBet extends DecidedBet {
  stake: number;
  profit: number;
}

export interface BacktestKpis {
  betCount: number;
  wonBets: number;
  lostBets: number;
  noResultBets: number;
  /** won / (won + lost) — les NO_RESULT sont exclus, jamais comptés en victoire. */
  hitRate: number;
  roiPct: number;
  yieldByMarket: Record<
    string,
    { bets: number; roiPct: number; hitRate: number }
  >;
  maxDrawdownPct: number;
  avgRealizedEdgePct: number;
  finalBankroll: number;
}

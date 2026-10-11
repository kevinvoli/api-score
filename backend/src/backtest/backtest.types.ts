import { SmartRulesConfig } from '../settings/smart-rules-config.service';

export type OddsSource = 'ODDS_SNAPSHOT';

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
    /** Source observable autorisée pour la cote au moment de la décision. */
    source: OddsSource[];
    /** Décision à T, cote prise à T + latence (exécution réaliste). */
    executionLatencyMs: number;
    /** Âge maximal d'une cote admissible ; absent = `DEFAULT_MAX_QUOTE_AGE_MS`. */
    maxQuoteAgeMs?: number;
    /** Restreint la cote à un bookmaker ; absent = meilleur snapshot admissible. */
    bookmakerKey?: string;
  };
  bankroll: number;
}

/**
 * `VOID` : match annulé, reporté ou interrompu avant que le pari soit décidé ; la mise est
 * rendue, exactement comme dans la simulation (`resolveSettlement`).
 */
export type BetOutcome = 'WON' | 'LOST' | 'VOID' | 'NO_RESULT';

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
  /** Cote réellement prise : celle observée à `decisionAt + executionLatencyMs`. */
  oddAtDecision: number;
  /** Cote observée à l'instant de décision ; sert à mesurer le slippage. */
  quotedOdd: number;
  oddSource: OddsSource;
  edgePct: number | null;
  confidenceScore: number | null;
  outcome: BetOutcome;
}

export interface StakedBet extends DecidedBet {
  stake: number;
  profit: number;
  /** false quand la bankroll disponible ne permettait aucune mise : pari non placé. */
  placed: boolean;
}

/**
 * Sort d'un signal unique (fixture, équipe, marché) pendant le rejeu, au stade le plus
 * avancé atteint. Les absences de cote sont comptées, jamais comblées.
 */
export type SignalStage =
  | 'NO_QUOTE_AT_DECISION'
  | 'BELOW_MIN_ODD_AT_DECISION'
  | 'NO_QUOTE_AT_EXECUTION'
  | 'BELOW_MIN_ODD_AT_EXECUTION'
  | 'PLACED';

export interface SignalRecord {
  fixtureId: string;
  marketType: string;
  /** Premier tick où la règle a déclenché ce signal. */
  firstSignalAt: Date;
  stage: SignalStage;
}

export interface SignalAccounting {
  signals: number;
  noQuoteAtDecision: number;
  belowMinOddAtDecision: number;
  noQuoteAtExecution: number;
  belowMinOddAtExecution: number;
  placed: number;
  /** Part des signaux disposant d'une cote admissible à la décision ET à l'exécution ; null sans signal. */
  oddsCoveragePct: number | null;
}

export interface ReplayResult {
  bets: DecidedBet[];
  signals: SignalRecord[];
  /** sha256 des données lues par le rejeu (stats, fixtures, buts, cotes candidates). */
  datasetHash: string;
}

export interface BacktestKpis {
  betCount: number;
  wonBets: number;
  lostBets: number;
  noResultBets: number;
  /** Paris remboursés (match annulé/reporté) : profit nul, hors mise totale, hit-rate et ROI. */
  voidBets: number;
  /** won / (won + lost) — NO_RESULT et VOID sont exclus, jamais comptés en victoire. */
  hitRate: number;
  roiPct: number;
  yieldByMarket: Record<
    string,
    { bets: number; roiPct: number; hitRate: number }
  >;
  maxDrawdownPct: number;
  avgRealizedEdgePct: number;
  finalBankroll: number;
  totalStaked: number;
  netProfit: number;
  /** Paris décidés mais non placés faute de bankroll disponible. */
  bankrollSkippedBets: number;
  /** Moyenne de (cote prise - cote à la décision) / cote à la décision, en % ; négatif = défavorable. */
  avgSlippagePct: number | null;
  /** IC 95 % (approximation normale) du rendement unitaire par pari résolu, en % ; null si moins de 2 paris. */
  roiCi95: { lowPct: number; highPct: number } | null;
}

import { apiFetch } from './client';
import type { SmartRulesConfig } from './smartRules';

export type BacktestKpis = {
  betCount: number;
  wonBets: number;
  lostBets: number;
  noResultBets: number;
  hitRate: number;
  roiPct: number;
  yieldByMarket: Record<
    string,
    { bets: number; roiPct: number; hitRate: number }
  >;
  maxDrawdownPct: number;
  avgRealizedEdgePct: number;
  finalBankroll: number;
};

export type BacktestRun = {
  id: string;
  name: string;
  strategy: { bankroll?: number; name?: string; version?: string };
  windowStart: string;
  windowEnd: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  kpis: BacktestKpis | null;
  totalBets: number;
  wonBets: number;
  lostBets: number;
  noResultBets: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type BetResult = {
  id: string;
  marketType: string;
  selection: string;
  ruleName: string | null;
  decisionAt: string;
  elapsedAtDecision: number | null;
  oddAtDecision: string | number;
  oddSource: 'ODDS_SNAPSHOT' | 'LIVE_PAYLOAD' | 'STRATEGY_DEFAULT';
  stake: string | number;
  outcome: 'WON' | 'LOST' | 'NO_RESULT';
  profit: string | number;
};

export type BacktestRunDetail = BacktestRun & {
  bets: BetResult[];
  betTotal: number;
};

export const fetchBacktestRuns = () =>
  apiFetch<BacktestRun[]>('/v1/audit/backtest');

export const fetchBacktestRun = (id: string) =>
  apiFetch<BacktestRunDetail>(`/v1/audit/backtest/${id}?limit=500`);

export const runBaselineBacktest = () =>
  apiFetch<BacktestRun>('/v1/audit/backtest', {
    method: 'POST',
    body: JSON.stringify({}),
  });

/**
 * LOT A.5 — bouton « Tester cette configuration en backtest » de Paramètres.
 * Envoie la config en cours d'édition (pas encore sauvegardée) au backend,
 * qui la rejoue sur l'historique sans jamais toucher à la config persistée.
 */
export const testBacktestConfig = (entryRules: SmartRulesConfig) =>
  apiFetch<BacktestRun>('/v1/audit/backtest', {
    method: 'POST',
    body: JSON.stringify({
      name: `Test config (Paramètres) — ${new Date().toLocaleString('fr-FR')}`,
      entryRules,
    }),
  });

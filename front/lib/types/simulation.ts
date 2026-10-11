/**
 * Miroir front du contrat de simulation (PLAN 3.3, `backend/src/simulation/*`). Tout y est
 * virtuel : aucune de ces données ne correspond à une mise réelle.
 */

export type SimulationRunStatus = 'RUNNING' | 'STOPPED';
export type DecisionStatus = 'REJECTED' | 'ELIGIBLE' | 'ORDER_RESERVED' | 'COMPLETED';
export type DecisionOutcome = 'WON' | 'LOST' | 'VOID' | 'NO_RESULT';

export interface SimulationRunListItem {
  id: string;
  name: string;
  strategyVersion: string;
  status: SimulationRunStatus;
  currency: string;
  initialBankroll: string;
  configHash: string;
  startedAt: string;
  stoppedAt: string | null;
  lastTickAt: string | null;
  createdAt: string;
}

export interface SimulationSummary {
  runId: string;
  status: SimulationRunStatus;
  currency: string;
  bankroll: { initial: string; available: string; openExposure: string; equity: string };
  pnl: { realized: string; turnover: string };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
    rejectionsByCode: Record<string, number>;
  };
  settled: { total: number; won: number; lost: number; void: number; noResult: number };
  hitRatePct: number | null;
  roiPct: number | null;
  maxDrawdownPct: number;
  latency: { configuredMs: number; avgObservedMs: number | null };
  avgSlippagePct: number | null;
  signals: { total: number; withExecutableOdd: number; coveragePct: number | null };
}

export interface DecisionView {
  id: string;
  decidedAt: string;
  fixtureId: string;
  marketType: string;
  selection: string;
  status: DecisionStatus;
  rejectionCode: string | null;
  stake: string | null;
  decisionOdd: number | null;
  executableOdd: number | null;
  slippagePct: number | null;
  outcome: DecisionOutcome | null;
  profit: string | null;
  currency: string;
}

export interface DecisionsPage {
  data: DecisionView[];
  nextCursor: string | null;
}

export interface DecisionsQuery {
  status?: DecisionStatus;
  cursor?: string;
  limit?: number;
}

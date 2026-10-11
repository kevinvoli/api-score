/**
 * Miroir front du contrat d'exécution (PLAN 3.1 et 3.4, `backend/src/execution/execution.types.ts`
 * et `execution.controller.ts`). Les dates arrivent en chaînes ISO, les montants en chaînes
 * décimales : aucun calcul monétaire ni décision de risque n'est fait côté navigateur.
 */

export const EXECUTION_MODES = ['DISABLED', 'SIMULATION', 'SANDBOX', 'LIVE_CANARY'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const ORDER_STATUSES = [
  'RESERVED',
  'SUBMITTING',
  'ACCEPTED',
  'REJECTED',
  'UNKNOWN',
  'SETTLED',
  'VOIDED',
  'RECONCILIATION_REQUIRED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuts qui exigent l'attention d'un humain : jamais présentés comme normaux. */
export const AMBIGUOUS_ORDER_STATUSES: readonly OrderStatus[] = ['UNKNOWN', 'RECONCILIATION_REQUIRED'];

export type RejectionCode =
  | 'NO_EXECUTABLE_ODD'
  | 'STALE_ODD'
  | 'SUSPENDED_MARKET'
  | 'ODD_MOVED'
  | 'LIMIT_EXCEEDED'
  | 'CONTROL_DISABLED'
  | 'RISK_CHECK_FAILED'
  | 'OPERATOR_UNAVAILABLE'
  | 'BELOW_MIN_ODD';

export type StopSource = 'BOOTSTRAP' | 'MANUAL' | 'AUTOMATIC';
export type GateKey = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';

/** Affichage seulement : le backend reste seul juge des transitions et des gates. */
export const GATES_REQUIRED_TO_ENTER: Record<ExecutionMode, readonly GateKey[]> = {
  DISABLED: [],
  SIMULATION: ['G1', 'G2'],
  SANDBOX: ['G3'],
  LIVE_CANARY: ['G4', 'G5', 'G6'],
};

/** Montant décimal en chaîne (« 12.34 »), jamais converti en nombre flottant. */
export type DecimalString = string;

export interface RiskLimitsView {
  version: number;
  currency: string;
  maxStakePerBet: DecimalString;
  maxDailyStake: DecimalString;
  maxDailyLoss: DecimalString;
  maxOpenExposure: DecimalString;
  maxQuoteAgeMs: number;
}

export type ReconciliationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ControlView {
  /** false : état illisible ou incohérent, l'exécution est considérée arrêtée. */
  readable: boolean;
  mode: ExecutionMode;
  version: number | null;
  activeRiskPolicyId: string | null;
  stopReason: string | null;
  stopSource: StopSource | null;
  changedByUserId: string | null;
  changedAt: string | null;
  realMoneyInterlockOpen: boolean;
  activeLimits: RiskLimitsView | null;
  reconciliation: {
    status: 'NEVER_RUN' | ReconciliationRunStatus;
    lastRunAt: string | null;
    criticalCount: number;
  };
}

/** Réponse des mutations de contrôle : l'état persisté, sans limites ni santé. */
export type ControlSnapshot = Omit<ControlView, 'activeLimits' | 'reconciliation'>;

export interface AccountView {
  id: string;
  mode: string;
  operatorKey: string;
  currency: string;
  availableBalance: DecimalString;
  reservedBalance: DecimalString;
  exposure: DecimalString;
  totalBalance: DecimalString;
  version: number;
  activeLimits: RiskLimitsView | null;
}

export interface OrderView {
  id: string;
  decisionId: string;
  accountId: string;
  mode: string;
  operatorKey: string;
  status: OrderStatus;
  rejectionCode: RejectionCode | null;
  statusReason: string | null;
  externalOrderId: string | null;
  currency: string;
  requestedStake: DecimalString;
  requestedOdd: number;
  minimumOdd: number;
  acceptedStake: DecimalString | null;
  acceptedOdd: number | null;
  payout: DecimalString | null;
  createdAt: string;
  settledAt: string | null;
  receipt: { receiptHash: string; redactedPayload: unknown } | null;
  reconciliation: { result: string; severity: string; checkedAt: string } | null;
}

export interface OrdersPage {
  data: OrderView[];
  nextCursor: string | null;
}

export interface OrdersQuery {
  accountId?: string;
  status?: OrderStatus;
  cursor?: string;
  limit?: number;
}

export type ReconciliationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ReconciliationItem {
  id: string;
  runId: string;
  orderId: string | null;
  itemType: 'ORDER' | 'RECEIPT' | 'SETTLEMENT' | 'LEDGER' | 'BALANCE';
  result: string;
  severity: ReconciliationSeverity;
  detail: string;
  createdAt: string;
}

export interface ReconciliationRun {
  id: string;
  idempotencyKey: string;
  accountId: string;
  rangeFrom: string;
  rangeTo: string;
  status: ReconciliationRunStatus;
  criticalCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  items: ReconciliationItem[];
}

export interface StopExecutionRequest {
  reason: string;
  expectedVersion?: number;
}

export interface ChangeModeRequest {
  targetMode: ExecutionMode;
  reason: string;
  expectedVersion: number;
  gateEvidenceIds: string[];
}

export interface StartReconciliationRequest {
  accountId: string;
  from: string;
  to: string;
  idempotencyKey: string;
}

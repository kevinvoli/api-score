/**
 * Contrat partagé du chantier d'exécution (PLAN 3.1). Les statuts SQL restent des
 * `varchar` contrôlés ici, pour évoluer sans `ALTER ENUM`.
 */
export { UserRole } from '../auth/auth.types';

export const EXECUTION_MODES = [
  'DISABLED',
  'SIMULATION',
  'SANDBOX',
  'LIVE_CANARY',
] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const DECISION_STATUSES = [
  'REJECTED',
  'ELIGIBLE',
  'ORDER_RESERVED',
  'COMPLETED',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

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

/**
 * `BELOW_MIN_ODD` complète la liste du PLAN 3.1 : une cote observée mais inférieure
 * au minimum de la règle n'est ni une absence de donnée ni un mouvement de marché.
 */
export const REJECTION_CODES = [
  'NO_EXECUTABLE_ODD',
  'STALE_ODD',
  'SUSPENDED_MARKET',
  'ODD_MOVED',
  'LIMIT_EXCEEDED',
  'CONTROL_DISABLED',
  'RISK_CHECK_FAILED',
  'OPERATOR_UNAVAILABLE',
  'BELOW_MIN_ODD',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export const DECISION_OUTCOMES = ['WON', 'LOST', 'VOID', 'NO_RESULT'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** Montant décimal en chaîne, deux décimales (« 12.34 »). Jamais un float. */
export type DecimalString = string;

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Conversion exacte d'un décimal (chaîne MySQL ou saisie) en centimes entiers :
 * aucun passage par un float, donc aucun arrondi caché.
 */
export function toCents(value: DecimalString): number {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Montant décimal invalide : ${value}`);
  const [, sign, units, fraction = ''] = match;
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Montant hors bornes : ${value}`);
  }
  return sign ? -cents : cents;
}

export function fromCents(cents: number): DecimalString {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Centimes non entiers : ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${units}.${fraction}`;
}

/** Gain net d'une mise gagnante, arrondi au centime le plus proche (règle unique). */
export function winningProfitCents(stakeCents: number, odd: number): number {
  // Cote à 3 décimales (decimal(8,3)) : calcul en millièmes entiers, exact avant l'arrondi.
  const oddMillis = Math.round(odd * 1000);
  return Math.round((stakeCents * (oddMillis - 1000)) / 1000);
}

// ── Lot 6 : contrôle d'exécution, gates, ledger ──────────────────────────────

/** Ordre des modes : une transition ne franchit qu'une marche à la fois. */
export const MODE_ORDER: readonly ExecutionMode[] = EXECUTION_MODES;

export const GATE_KEYS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type GateKey = (typeof GATE_KEYS)[number];

/**
 * Gates exigées pour MONTER vers un mode (PLAN 4). Descendre n'en exige aucune :
 * réduire l'exposition est toujours permis.
 */
export const GATES_REQUIRED_TO_ENTER: Record<
  ExecutionMode,
  readonly GateKey[]
> = {
  DISABLED: [],
  SIMULATION: ['G1', 'G2'],
  SANDBOX: ['G3'],
  LIVE_CANARY: ['G4', 'G5', 'G6'],
};

export const GATE_VERDICTS = ['GO', 'NO_GO'] as const;
export type GateVerdict = (typeof GATE_VERDICTS)[number];

export const LEDGER_ENTRY_TYPES = [
  'RESERVE',
  'RELEASE',
  'SETTLE',
  'ADJUSTMENT',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const STOP_SOURCES = ['BOOTSTRAP', 'MANUAL', 'AUTOMATIC'] as const;
export type StopSource = (typeof STOP_SOURCES)[number];

/** Causes d'arrêt automatique (PLAN lot 6). Les causes opérateur seront branchées aux lots 7-8. */
export const AUTO_STOP_TRIGGERS = [
  'CONTROL_UNREADABLE',
  'STALE_OR_SUSPENDED_ODD',
  'DAILY_LIMIT_REACHED',
  'OPERATOR_BALANCE_MISMATCH',
  'UNKNOWN_ORDER_TOO_OLD',
  'RECEIPT_MISSING',
  'RECONCILIATION_LATE',
  'OPERATOR_ERROR_RATE',
  'CLOCK_OUT_OF_TOLERANCE',
  'LEDGER_INVARIANT_BROKEN',
  'RECEIPT_INVALID',
  'OPERATOR_CONTRACT_VIOLATION',
] as const;
export type AutoStopTrigger = (typeof AUTO_STOP_TRIGGERS)[number];

/** Écart maximal toléré entre l'horloge applicative et celle de MySQL. */
export const CLOCK_TOLERANCE_MS = 2_000;

/** Motifs de refus du moteur de risque (sous-ensemble de `RejectionCode` + limite visée). */
export const RISK_LIMITS = [
  'MAX_STAKE_PER_BET',
  'DAILY_STAKE',
  'DAILY_LOSS',
  'OPEN_EXPOSURE',
  'AVAILABLE_BALANCE',
  'QUOTE_AGE',
] as const;
export type RiskLimit = (typeof RISK_LIMITS)[number];

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return (
    typeof value === 'string' &&
    (EXECUTION_MODES as readonly string[]).includes(value)
  );
}

/** Interlock argent réel : seule la chaîne exacte `true` l'ouvre ; toute autre valeur le ferme. */
export function isRealMoneyInterlockOpen(raw: string | undefined): boolean {
  return raw === 'true';
}

// ── Lot 7 : ordres et réconciliation ─────────────────────────────────────────

/** Fenêtre de déduplication d'une décision dans la clé d'idempotence d'ordre (PLAN 3.4). */
export const DECISION_BUCKET_MS = 15 * 60 * 1000;
/** Un ordre UNKNOWN introuvable chez l'opérateur n'est déclaré non placé qu'après ce délai. */
export const UNKNOWN_GRACE_MS = 5 * 60 * 1000;
/** Au-delà, un UNKNOWN non résolu arrête l'exécution. */
export const UNKNOWN_MAX_AGE_MS = 30 * 60 * 1000;
/** Un ordre resté SUBMITTING plus longtemps est traité comme ambigu (crash entre appel et persistance). */
export const SUBMITTING_STALE_MS = 60 * 1000;
/**
 * Délai maximal d'un appel de placement. L'appel se fait sous le verrou partagé du contrôle :
 * il doit rester sous `innodb_lock_wait_timeout` (50 s par défaut) pour qu'un arrêt manuel,
 * qui attend ce verrou, ne puisse jamais échouer à cause d'un opérateur bloqué. Au-delà,
 * l'ordre devient UNKNOWN (jamais resoumis). Inférieur à SUBMITTING_STALE_MS.
 */
export const SUBMISSION_TIMEOUT_MS = 20 * 1000;

export const RECONCILIATION_RESULTS = [
  'MATCH',
  'RESOLVED',
  'MISMATCH',
  'MISSING_AT_OPERATOR',
  'MISSING_LOCALLY',
  'PENDING',
] as const;
export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number];

export const RECONCILIATION_ITEM_TYPES = [
  'ORDER',
  'RECEIPT',
  'SETTLEMENT',
  'LEDGER',
  'BALANCE',
] as const;
export type ReconciliationItemType = (typeof RECONCILIATION_ITEM_TYPES)[number];

export type ReconciliationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

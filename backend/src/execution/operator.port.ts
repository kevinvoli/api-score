import type { DecimalString, ExecutionMode } from './execution.types';
import type { ExecutableQuoteTarget } from '../odds/odds.types';

/**
 * Port opérateur (PLAN 3.3, ADR 004). Le pipeline ne connaît que ce contrat ; chaque
 * adaptateur traduit les identifiants et erreurs natifs. Un timeout ou une réponse
 * illisible devient `UNKNOWN`, jamais un nouvel essai de placement.
 */
export interface QuoteRequest {
  target: ExecutableQuoteTarget;
  at: Date;
  maxQuoteAgeMs: number;
}

export interface OperatorQuote {
  snapshotId: string | null;
  oddValue: number;
  capturedAt: Date;
  available: boolean;
}

export interface PlaceOrderRequest {
  decisionId: string;
  idempotencyKey: string;
  operatorKey: string;
  fixtureId: string;
  providerFixtureId: string;
  marketKey: string;
  selectionKey: string;
  requestedOdd: number;
  minimumOdd: number;
  stake: DecimalString;
  currency: string;
  quoteCapturedAt: Date;
}

export type PlaceOrderResult =
  | {
      status: 'ACCEPTED';
      externalOrderId: string;
      acceptedOdd: number;
      acceptedStake: DecimalString;
      acceptedAt: Date;
      receiptHash: string;
      rawReceipt: unknown;
    }
  | { status: 'REJECTED'; reasonCode: string; rawReceipt: unknown }
  | { status: 'UNKNOWN'; reason: string };

export type OperatorOrderStatus =
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SETTLED'
  | 'VOIDED';

export interface OperatorOrder {
  externalOrderId: string | null;
  idempotencyKey: string;
  status: OperatorOrderStatus;
  acceptedOdd: number | null;
  acceptedStake: DecimalString | null;
  acceptedAt: Date | null;
  receiptHash: string | null;
  /** Gain brut rendu au solde au règlement (mise × cote, mise si VOID, 0 si perdu). */
  payout: DecimalString | null;
  settledAt: Date | null;
  rawReceipt: unknown;
}

export type OperatorOrderLookup =
  | { idempotencyKey: string; status: 'FOUND'; order: OperatorOrder }
  | { idempotencyKey: string; status: 'NOT_FOUND' }
  | { idempotencyKey: string; status: 'LOOKUP_FAILED'; reason: string };

export interface OperatorBalance {
  currency: string;
  /** Disponible, hors paris ouverts. */
  available: DecimalString;
  /** Montant engagé sur des paris ouverts. */
  exposure: DecimalString;
}

export type OperatorKind = 'PAPER' | 'SANDBOX' | 'LIVE';

export interface OperatorPort {
  readonly kind: OperatorKind;
  readonly operatorKey: string;
  getExecutableQuote(input: QuoteRequest): Promise<OperatorQuote | null>;
  placeOrder(input: PlaceOrderRequest): Promise<PlaceOrderResult>;
  getOrdersByIdempotencyKeys(
    keys: readonly string[],
  ): Promise<OperatorOrderLookup[]>;
  getOrderByIdempotencyKey(key: string): Promise<OperatorOrder | null>;
  getOrderByExternalId(id: string): Promise<OperatorOrder | null>;
  getBalance(currency: string): Promise<OperatorBalance>;
}

export const OPERATOR_PORTS = Symbol('OPERATOR_PORTS');

/** Adaptateur par mode. LIVE_CANARY n'a aucun adaptateur avant le lot 8 : refus systématique. */
export type OperatorPortsByMode = Partial<Record<ExecutionMode, OperatorPort>>;

/** Garde de forme d'une acceptation : tout champ manquant ou incohérent rend la réponse ambiguë. */
export function isWellFormedAcceptance(
  result: PlaceOrderResult,
): result is Extract<PlaceOrderResult, { status: 'ACCEPTED' }> {
  if (result.status !== 'ACCEPTED') return false;
  return (
    typeof result.externalOrderId === 'string' &&
    result.externalOrderId.length > 0 &&
    result.externalOrderId.length <= 128 &&
    typeof result.acceptedOdd === 'number' &&
    Number.isFinite(result.acceptedOdd) &&
    result.acceptedOdd > 1 &&
    typeof result.acceptedStake === 'string' &&
    /^\d{1,12}(\.\d{1,2})?$/.test(result.acceptedStake) &&
    result.acceptedAt instanceof Date &&
    !Number.isNaN(result.acceptedAt.getTime()) &&
    typeof result.receiptHash === 'string' &&
    /^[0-9a-f]{64}$/.test(result.receiptHash)
  );
}

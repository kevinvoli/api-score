/**
 * Expurgation des reçus et réponses opérateur AVANT tout stockage ou journal. Approche par
 * liste blanche de clés métier ; tout le reste est conservé seulement si la valeur ne
 * ressemble pas à un secret. Profondeur, tailles de tableaux et de chaînes bornées.
 */
export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 256;
const MAX_KEYS = 100;

/** Clés dont la valeur est toujours masquée, quelle qu'elle soit. */
const SENSITIVE_KEY =
  /(pass(word)?|secret|token|api[-_]?key|auth|cookie|session|signature|credential|private|iban|bic|card|pan|cvv|account(number|no)?$|email|phone|address|birth|ssn|document)/i;

/** Clés métier explicitement autorisées même si elles contiennent un mot sensible. */
const ALLOWED_KEYS = new Set([
  'externalOrderId',
  'idempotencyKey',
  'orderId',
  'status',
  'odd',
  'acceptedOdd',
  'requestedOdd',
  'stake',
  'acceptedStake',
  'payout',
  'currency',
  'marketKey',
  'selectionKey',
  'acceptedAt',
  'settledAt',
  'reasonCode',
  'receiptHash',
]);

/** Valeurs qui ressemblent à un secret même sous une clé anodine. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+\S+/i,
  /\bBasic\s+\S+/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, // JWT
  /\b\d{13,19}\b/, // numéro de carte
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/, // IBAN
  /[A-Za-z0-9+/_-]{40,}={0,2}/, // jeton ou clé longue
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
];

function redactString(value: string): string {
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return REDACTED;
  }
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

export function redactReceipt(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return redactString(input);
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input === 'boolean') return input;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString();
  }
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(input)) {
    return input
      .slice(0, MAX_ARRAY)
      .map((item) => redactReceipt(item, depth + 1));
  }
  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    ).slice(0, MAX_KEYS)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        continue;
      if (!ALLOWED_KEYS.has(key) && SENSITIVE_KEY.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] =
        ALLOWED_KEYS.has(key) && typeof value === 'string'
          ? redactString(value)
          : redactReceipt(value, depth + 1);
    }
    return output;
  }
  // fonctions, symboles, bigint : jamais sérialisés
  return null;
}

/** Message d'erreur opérateur journalisable : une ligne, expurgée, bornée. */
export function redactErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactString(raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(
    0,
    200,
  );
}

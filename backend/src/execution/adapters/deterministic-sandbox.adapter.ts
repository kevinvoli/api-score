import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { fromCents, toCents, winningProfitCents } from '../execution.types';
import type {
  OperatorBalance,
  OperatorOrder,
  OperatorOrderLookup,
  OperatorPort,
  OperatorQuote,
  PlaceOrderRequest,
  PlaceOrderResult,
  QuoteRequest,
} from '../operator.port';

export const SANDBOX_SCENARIOS = [
  'ACCEPT',
  'REJECT',
  'ODD_MOVED',
  'TIMEOUT_BEFORE_ACCEPT',
  'TIMEOUT_AFTER_ACCEPT',
  'DELAYED',
  'MALFORMED',
  'DUPLICATE_RECEIPT',
] as const;
export type SandboxScenario = (typeof SANDBOX_SCENARIOS)[number];

export class SandboxTimeoutError extends Error {
  constructor() {
    super('Délai dépassé (sandbox)');
    this.name = 'SandboxTimeoutError';
  }
}

/**
 * Sandbox déterministe (mode SANDBOX) : aucun hasard, aucun réseau. Chaque appel à
 * `placeOrder` consomme le prochain scénario programmé (défaut ACCEPT) pour forcer
 * acceptation, refus, mouvement de cote, timeout avant/après acceptation, visibilité
 * retardée, réponse malformée ou reçu dupliqué. Comme un vrai opérateur, la sandbox
 * déduplique par clé d'idempotence : un second envoi de la même clé ne crée rien.
 */
@Injectable()
export class DeterministicSandboxAdapter implements OperatorPort {
  readonly kind = 'SANDBOX' as const;
  readonly operatorKey = 'sandbox';

  private readonly book = new Map<string, OperatorOrder>();
  private readonly hiddenReads = new Map<string, number>();
  private readonly placeCalls = new Map<string, number>();
  private readonly balances = new Map<
    string,
    { availableCents: number; exposureCents: number }
  >();
  private readonly queue: SandboxScenario[] = [];
  private quoteOdd: number | null = 1.9;
  private sequence = 0;
  private lastReceiptHash: string | null = null;

  // ── Pilotage déterministe (tests et campagnes G4) ──────────────────────────
  enqueue(...scenarios: SandboxScenario[]): void {
    this.queue.push(...scenarios);
  }

  setQuoteOdd(odd: number | null): void {
    this.quoteOdd = odd;
  }

  fund(currency: string, amount: string): void {
    this.balances.set(currency, {
      availableCents: toCents(amount),
      exposureCents: 0,
    });
  }

  /** Écart volontaire du solde opérateur (test de solde divergent). */
  shiftBalance(currency: string, deltaCents: number): void {
    const balance = this.balanceOf(currency);
    balance.availableCents += deltaCents;
  }

  placementsFor(key: string): number {
    return this.book.has(key) ? 1 : 0;
  }

  placeCallsFor(key: string): number {
    return this.placeCalls.get(key) ?? 0;
  }

  settle(externalOrderId: string, outcome: 'WON' | 'LOST' | 'VOID'): void {
    const order = [...this.book.values()].find(
      (o) => o.externalOrderId === externalOrderId,
    );
    if (!order || order.status !== 'ACCEPTED') {
      throw new Error(`Ordre sandbox ${externalOrderId} non réglable`);
    }
    const stakeCents = toCents(order.acceptedStake!);
    const payoutCents =
      outcome === 'WON'
        ? stakeCents + winningProfitCents(stakeCents, order.acceptedOdd!)
        : outcome === 'VOID'
          ? stakeCents
          : 0;
    const balance = this.balanceOf(this.currencyOf(order));
    balance.exposureCents -= stakeCents;
    balance.availableCents += payoutCents;
    order.status = outcome === 'VOID' ? 'VOIDED' : 'SETTLED';
    order.payout = fromCents(payoutCents);
    order.settledAt = new Date();
  }

  reset(): void {
    this.book.clear();
    this.hiddenReads.clear();
    this.placeCalls.clear();
    this.balances.clear();
    this.queue.length = 0;
    this.quoteOdd = 1.9;
    // La séquence n'est PAS remise à zéro : un opérateur ne réutilise jamais un identifiant.
    this.lastReceiptHash = null;
  }

  // ── Port opérateur ──────────────────────────────────────────────────────────
  async getExecutableQuote(input: QuoteRequest): Promise<OperatorQuote | null> {
    return this.quoteOdd === null
      ? null
      : {
          snapshotId: null,
          oddValue: this.quoteOdd,
          capturedAt: input.at,
          available: true,
        };
  }

  async placeOrder(input: PlaceOrderRequest): Promise<PlaceOrderResult> {
    this.placeCalls.set(
      input.idempotencyKey,
      this.placeCallsFor(input.idempotencyKey) + 1,
    );
    const already = this.book.get(input.idempotencyKey);
    if (already) return this.accepted(already);

    const scenario = this.queue.shift() ?? 'ACCEPT';
    switch (scenario) {
      case 'REJECT':
        return {
          status: 'REJECTED',
          reasonCode: 'MARKET_CLOSED',
          rawReceipt: { reasonCode: 'MARKET_CLOSED' },
        };
      case 'ODD_MOVED':
        return {
          status: 'REJECTED',
          reasonCode: 'ODD_MOVED',
          rawReceipt: { reasonCode: 'ODD_MOVED' },
        };
      case 'TIMEOUT_BEFORE_ACCEPT':
        throw new SandboxTimeoutError();
      case 'TIMEOUT_AFTER_ACCEPT':
        this.book.set(input.idempotencyKey, this.newOrder(input));
        throw new SandboxTimeoutError();
      case 'DELAYED':
        this.book.set(input.idempotencyKey, this.newOrder(input));
        this.hiddenReads.set(input.idempotencyKey, 1);
        return { status: 'UNKNOWN', reason: 'Accusé de réception retardé' };
      case 'MALFORMED': {
        const order = this.newOrder(input);
        this.book.set(input.idempotencyKey, order);
        // Acceptation sans hash de reçu ni cote : réponse inexploitable.
        return {
          status: 'ACCEPTED',
          externalOrderId: order.externalOrderId!,
          acceptedOdd: Number.NaN,
          acceptedStake: order.acceptedStake!,
          acceptedAt: order.acceptedAt!,
          receiptHash: '',
          rawReceipt: { partial: true },
        };
      }
      case 'DUPLICATE_RECEIPT': {
        const previous = this.lastReceiptHash;
        const order = this.newOrder(input);
        order.receiptHash = previous ?? order.receiptHash;
        this.book.set(input.idempotencyKey, order);
        return this.accepted(order);
      }
      default: {
        const order = this.newOrder(input);
        this.book.set(input.idempotencyKey, order);
        return this.accepted(order);
      }
    }
  }

  async getOrderByIdempotencyKey(key: string): Promise<OperatorOrder | null> {
    const hidden = this.hiddenReads.get(key) ?? 0;
    if (hidden > 0) {
      this.hiddenReads.set(key, hidden - 1);
      return null;
    }
    return this.book.get(key) ?? null;
  }

  async getOrdersByIdempotencyKeys(
    keys: readonly string[],
  ): Promise<OperatorOrderLookup[]> {
    return Promise.all(
      [...new Set(keys)].map(async (idempotencyKey) => {
        const order = await this.getOrderByIdempotencyKey(idempotencyKey);
        return order
          ? { idempotencyKey, status: 'FOUND' as const, order }
          : { idempotencyKey, status: 'NOT_FOUND' as const };
      }),
    );
  }

  async getOrderByExternalId(id: string): Promise<OperatorOrder | null> {
    return (
      [...this.book.values()].find((order) => order.externalOrderId === id) ??
      null
    );
  }

  async getBalance(currency: string): Promise<OperatorBalance> {
    const balance = this.balanceOf(currency);
    return {
      currency,
      available: fromCents(balance.availableCents),
      exposure: fromCents(balance.exposureCents),
    };
  }

  // ── Interne ─────────────────────────────────────────────────────────────────
  private newOrder(input: PlaceOrderRequest): OperatorOrder {
    this.sequence += 1;
    const externalOrderId = `SBX-${String(this.sequence).padStart(6, '0')}`;
    const stakeCents = toCents(input.stake);
    const balance = this.balanceOf(input.currency);
    balance.availableCents -= stakeCents;
    balance.exposureCents += stakeCents;
    const receiptHash = createHash('sha256')
      .update(
        `${externalOrderId}|${input.idempotencyKey}|${input.requestedOdd}|${input.stake}`,
      )
      .digest('hex');
    this.lastReceiptHash = receiptHash;
    this.currencies.set(externalOrderId, input.currency);
    return {
      externalOrderId,
      idempotencyKey: input.idempotencyKey,
      status: 'ACCEPTED',
      acceptedOdd: input.requestedOdd,
      acceptedStake: input.stake,
      acceptedAt: new Date(),
      receiptHash,
      payout: null,
      settledAt: null,
      // Contient volontairement des champs sensibles : le pipeline doit les expurger.
      rawReceipt: {
        externalOrderId,
        acceptedOdd: input.requestedOdd,
        acceptedStake: input.stake,
        sessionToken: 'sandbox-session-secret',
        operatorAccount: {
          email: 'punter@sandbox.test',
          accountNumber: '0001234567',
        },
      },
    };
  }

  private readonly currencies = new Map<string, string>();

  private currencyOf(order: OperatorOrder): string {
    return this.currencies.get(order.externalOrderId!) ?? 'EUR';
  }

  private balanceOf(currency: string) {
    let balance = this.balances.get(currency);
    if (!balance) {
      balance = { availableCents: 0, exposureCents: 0 };
      this.balances.set(currency, balance);
    }
    return balance;
  }

  private accepted(order: OperatorOrder): PlaceOrderResult {
    return {
      status: 'ACCEPTED',
      externalOrderId: order.externalOrderId!,
      acceptedOdd: order.acceptedOdd!,
      acceptedStake: order.acceptedStake!,
      acceptedAt: order.acceptedAt!,
      receiptHash: order.receiptHash!,
      rawReceipt: order.rawReceipt,
    };
  }
}

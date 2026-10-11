import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Fixture } from '../../database/entities/fixture.entity';
import { ExecutableQuoteService } from '../../odds/executable-quote.service';
import { resolveSettlement } from '../../recommendations/rules/outcome-resolver';
import { finalStateOf } from '../../simulation/simulation.service';
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

interface PaperBooking {
  order: OperatorOrder;
  fixtureId: string;
  marketKey: string;
  isHomeTeam: boolean;
}

const MARKET_TYPE_BY_KEY: Record<string, string> = {
  TEAM_GOAL_1H: 'Buts 1ère mi-temps',
  TEAM_GOAL_2H: 'Buts 2ème mi-temps',
  TEAM_GOALS_FT: 'Buts match',
};

/**
 * Opérateur papier (mode SIMULATION) : reproduit la simulation — acceptation à la cote
 * observée si elle tient le minimum, règlement selon le résultat du match. Carnet en
 * mémoire : la réconciliation ne compare pas le solde ni la présence chez l'opérateur
 * pour cet adaptateur (voir ReconciliationService).
 */
@Injectable()
export class PaperOperatorAdapter implements OperatorPort {
  readonly kind = 'PAPER' as const;
  readonly operatorKey = 'paper';
  private readonly book = new Map<string, PaperBooking>();

  constructor(
    private readonly quotes: ExecutableQuoteService,
    @InjectRepository(Fixture) private readonly fixtures: Repository<Fixture>,
  ) {}

  async getExecutableQuote(input: QuoteRequest): Promise<OperatorQuote | null> {
    const candidates = await this.quotes.loadCandidates({
      providerFixtureIds: [input.target.providerFixtureId],
      receivedFrom: new Date(input.at.getTime() - input.maxQuoteAgeMs),
      receivedTo: input.at,
    });
    const quote = this.quotes.selectLatest(candidates, {
      target: input.target,
      at: input.at,
      maxQuoteAgeMs: input.maxQuoteAgeMs,
    });
    return quote
      ? {
          snapshotId: quote.snapshotId,
          oddValue: quote.oddValue,
          capturedAt: quote.observedAt,
          available: quote.available,
        }
      : null;
  }

  async placeOrder(input: PlaceOrderRequest): Promise<PlaceOrderResult> {
    const existing = this.book.get(input.idempotencyKey);
    if (existing) return this.toResult(existing.order);

    const now = new Date();
    const quote = await this.getExecutableQuote({
      target: {
        providerFixtureId: input.providerFixtureId,
        marketKey: input.marketKey,
        selectionKey: input.selectionKey,
      },
      at: now,
      maxQuoteAgeMs:
        Math.max(1, now.getTime() - input.quoteCapturedAt.getTime()) + 60_000,
    });
    if (!quote) {
      return {
        status: 'REJECTED',
        reasonCode: 'NO_QUOTE',
        rawReceipt: { idempotencyKey: input.idempotencyKey },
      };
    }
    if (quote.oddValue < input.minimumOdd) {
      return {
        status: 'REJECTED',
        reasonCode: 'ODD_MOVED',
        rawReceipt: {
          idempotencyKey: input.idempotencyKey,
          odd: quote.oddValue,
        },
      };
    }
    const externalOrderId = `PAPER-${input.idempotencyKey.slice(0, 24)}`;
    const order: OperatorOrder = {
      externalOrderId,
      idempotencyKey: input.idempotencyKey,
      status: 'ACCEPTED',
      acceptedOdd: quote.oddValue,
      acceptedStake: input.stake,
      acceptedAt: now,
      receiptHash: createHash('sha256')
        .update(
          `${externalOrderId}|${input.idempotencyKey}|${quote.oddValue}|${input.stake}`,
        )
        .digest('hex'),
      payout: null,
      settledAt: null,
      rawReceipt: { externalOrderId, odd: quote.oddValue, stake: input.stake },
    };
    this.book.set(input.idempotencyKey, {
      order,
      fixtureId: input.fixtureId,
      marketKey: input.marketKey,
      isHomeTeam: input.selectionKey.startsWith('HOME'),
    });
    return this.toResult(order);
  }

  async getOrderByIdempotencyKey(key: string): Promise<OperatorOrder | null> {
    const [result] = await this.getOrdersByIdempotencyKeys([key]);
    return result?.status === 'FOUND' ? result.order : null;
  }

  async getOrdersByIdempotencyKeys(
    keys: readonly string[],
  ): Promise<OperatorOrderLookup[]> {
    const uniqueKeys = [...new Set(keys)];
    const bookings = uniqueKeys
      .map((key) => this.book.get(key))
      .filter((booking): booking is PaperBooking => booking !== undefined);
    const fixtureIds = [
      ...new Set(
        bookings
          .filter((booking) => booking.order.status === 'ACCEPTED')
          .map((booking) => booking.fixtureId),
      ),
    ];
    const fixtures = fixtureIds.length
      ? await this.fixtures.findBy({ id: In(fixtureIds) })
      : [];
    const fixtureById = new Map(
      fixtures.map((fixture) => [fixture.id, fixture]),
    );

    return uniqueKeys.map((idempotencyKey) => {
      const booking = this.book.get(idempotencyKey);
      if (!booking) return { idempotencyKey, status: 'NOT_FOUND' as const };
      return {
        idempotencyKey,
        status: 'FOUND' as const,
        order: this.refreshSettlementFromFixture(
          booking,
          fixtureById.get(booking.fixtureId) ?? null,
        ),
      };
    });
  }

  async getOrderByExternalId(id: string): Promise<OperatorOrder | null> {
    for (const booking of this.book.values()) {
      if (booking.order.externalOrderId === id)
        return this.refreshSettlement(booking);
    }
    return null;
  }

  async getBalance(): Promise<OperatorBalance> {
    throw new Error('Solde non suivi par l’opérateur papier');
  }

  private async refreshSettlement(
    booking: PaperBooking,
  ): Promise<OperatorOrder> {
    const fixture = await this.fixtures.findOneBy({ id: booking.fixtureId });
    return this.refreshSettlementFromFixture(booking, fixture);
  }

  private refreshSettlementFromFixture(
    booking: PaperBooking,
    fixture: Fixture | null,
  ): OperatorOrder {
    const order = booking.order;
    if (order.status !== 'ACCEPTED') return order;
    const marketType = MARKET_TYPE_BY_KEY[booking.marketKey];
    if (!fixture || !marketType) return order;
    const outcome = resolveSettlement(
      { marketType, isHomeTeam: booking.isHomeTeam },
      finalStateOf(fixture),
    );
    if (!outcome) return order;
    const stakeCents = toCents(order.acceptedStake!);
    order.status = outcome === 'VOID' ? 'VOIDED' : 'SETTLED';
    order.payout = fromCents(
      outcome === 'WON'
        ? stakeCents + winningProfitCents(stakeCents, order.acceptedOdd!)
        : outcome === 'VOID'
          ? stakeCents
          : 0,
    );
    order.settledAt = new Date();
    return order;
  }

  private toResult(order: OperatorOrder): PlaceOrderResult {
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

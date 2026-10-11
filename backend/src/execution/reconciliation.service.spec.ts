import { BetOrder } from '../database/entities/bet-order.entity';
import { OperatorOrder, OperatorPort } from './operator.port';
import {
  ItemDraft,
  compareOrder,
  lookupOperatorOrders,
  stopTriggerFor,
} from './reconciliation.service';

const KEY = 'k'.repeat(64);

function order(patch: Partial<BetOrder> = {}): BetOrder {
  return {
    id: 'o1',
    idempotencyKey: KEY,
    status: 'ACCEPTED',
    statusReason: null,
    externalOrderId: 'SBX-000001',
    acceptedStake: '10.00',
    acceptedOdd: 1.9,
    payout: null,
    ...patch,
  } as BetOrder;
}

function operator(patch: Partial<OperatorOrder> = {}): OperatorOrder {
  return {
    externalOrderId: 'SBX-000001',
    idempotencyKey: KEY,
    status: 'ACCEPTED',
    acceptedOdd: 1.9,
    acceptedStake: '10.00',
    acceptedAt: new Date(),
    receiptHash: 'a'.repeat(64),
    payout: null,
    settledAt: null,
    rawReceipt: { sessionToken: 'secret' },
    ...patch,
  };
}

const keys = (...k: string[]) => new Set(k.map((p) => `${p}:${KEY}`));
const critical = (items: ItemDraft[]) =>
  items.filter((i) => i.severity === 'CRITICAL');

describe('compareOrder', () => {
  it('ordre accepté concordant : un seul MATCH INFO', () => {
    const items = compareOrder(
      order(),
      operator(),
      true,
      keys('reserve'),
      true,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ result: 'MATCH', severity: 'INFO' });
  });

  it('ordre accepté introuvable : CRITICAL chez un opérateur suivi, WARNING en papier', () => {
    expect(
      compareOrder(order(), null, true, keys('reserve'), true)[0],
    ).toMatchObject({ result: 'MISSING_AT_OPERATOR', severity: 'CRITICAL' });
    expect(
      compareOrder(order(), null, true, keys('reserve'), false)[0],
    ).toMatchObject({ result: 'MISSING_AT_OPERATOR', severity: 'WARNING' });
  });

  it.each([
    ['mise', { acceptedStake: '9.00' }],
    ['cote', { acceptedOdd: 2.0 }],
    ['id externe', { externalOrderId: 'SBX-999999' }],
    ['refus opérateur', { status: 'REJECTED' as const }],
  ])('écart de %s : MISMATCH CRITICAL', (_l, patch) => {
    const items = compareOrder(
      order(),
      operator(patch),
      true,
      keys('reserve'),
      true,
    );
    expect(items[0]).toMatchObject({
      itemType: 'ORDER',
      result: 'MISMATCH',
      severity: 'CRITICAL',
    });
  });

  it('la preuve ne contient jamais le reçu brut', () => {
    const items = compareOrder(
      order(),
      operator({ acceptedOdd: 2 }),
      true,
      keys('reserve'),
      true,
    );
    expect(JSON.stringify(items)).not.toContain('secret');
  });

  it('acceptation sans reçu ni réservation : RECEIPT et LEDGER critiques', () => {
    const items = critical(
      compareOrder(order(), operator(), false, keys(), true),
    );
    expect(items.map((i) => i.itemType).sort()).toEqual(['LEDGER', 'RECEIPT']);
  });

  it('ordre réglé : exige l’écriture de règlement et un gain identique', () => {
    const settled = order({ status: 'SETTLED', payout: '19.00' });
    const op = operator({ status: 'SETTLED', payout: '19.00' });
    expect(
      critical(
        compareOrder(settled, op, true, keys('reserve', 'settle'), true),
      ),
    ).toEqual([]);
    expect(
      critical(compareOrder(settled, op, true, keys('reserve'), true)).map(
        (i) => i.detail,
      ),
    ).toEqual(['Ordre réglé sans écriture de règlement']);
    expect(
      critical(
        compareOrder(
          settled,
          operator({ status: 'SETTLED', payout: '0.00' }),
          true,
          keys('reserve', 'settle'),
          true,
        ),
      )[0],
    ).toMatchObject({ itemType: 'SETTLEMENT', result: 'MISMATCH' });
  });

  it('ordre refusé : présent chez l’opérateur ou mise non relâchée → CRITICAL', () => {
    const rejected = order({ status: 'REJECTED', externalOrderId: null });
    expect(
      compareOrder(rejected, null, false, keys('reserve', 'release'), true),
    ).toEqual([]);
    expect(compareOrder(rejected, null, false, keys(), true)).toEqual([]);
    expect(
      critical(compareOrder(rejected, null, false, keys('reserve'), true))[0],
    ).toMatchObject({ itemType: 'LEDGER' });
    expect(
      critical(
        compareOrder(
          rejected,
          operator(),
          false,
          keys('reserve', 'release'),
          true,
        ),
      )[0],
    ).toMatchObject({ itemType: 'ORDER', result: 'MISMATCH' });
  });

  it('RECONCILIATION_REQUIRED reste critique tant qu’un humain n’a pas tranché', () => {
    const items = compareOrder(
      order({
        status: 'RECONCILIATION_REQUIRED',
        statusReason: 'Reçu dupliqué',
      }),
      operator(),
      false,
      keys('reserve'),
      true,
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        result: 'MISMATCH',
        severity: 'CRITICAL',
        detail: 'Reçu dupliqué',
      }),
    );
  });
});

describe('stopTriggerFor', () => {
  const draft = (
    itemType: ItemDraft['itemType'],
    severity: ItemDraft['severity'],
    detail = 'x',
  ): ItemDraft => ({
    orderId: null,
    itemType,
    result: 'MISMATCH',
    severity,
    detail,
    expected: null,
    observed: null,
  });

  it('aucun arrêt sans écart critique', () => {
    expect(
      stopTriggerFor([draft('ORDER', 'WARNING'), draft('BALANCE', 'INFO')]),
    ).toBeNull();
  });

  it('choisit la cause la plus précise', () => {
    expect(
      stopTriggerFor([
        draft('ORDER', 'CRITICAL'),
        draft('BALANCE', 'CRITICAL'),
      ]),
    ).toBe('OPERATOR_BALANCE_MISMATCH');
    expect(
      stopTriggerFor([
        draft('LEDGER', 'CRITICAL'),
        draft('RECEIPT', 'CRITICAL'),
      ]),
    ).toBe('RECEIPT_MISSING');
    expect(stopTriggerFor([draft('LEDGER', 'CRITICAL')])).toBe(
      'LEDGER_INVARIANT_BROKEN',
    );
    expect(
      stopTriggerFor([draft('ORDER', 'CRITICAL', 'Ordre UNKNOWN trop ancien')]),
    ).toBe('UNKNOWN_ORDER_TOO_OLD');
    expect(stopTriggerFor([draft('ORDER', 'CRITICAL')])).toBe(
      'OPERATOR_CONTRACT_VIOLATION',
    );
    expect(
      stopTriggerFor([draft('ORDER', 'CRITICAL', 'LOOKUP_FAILED : timeout')]),
    ).toBe('OPERATOR_ERROR_RATE');
  });
});

describe('lookupOperatorOrders', () => {
  const port = () =>
    ({
      getOrdersByIdempotencyKeys: jest.fn(),
    }) as unknown as OperatorPort;

  it('effectue une seule lecture groupée quel que soit le volume', async () => {
    const adapter = port();
    const keys = Array.from({ length: 100 }, (_, index) => `key-${index}`);
    jest.mocked(adapter.getOrdersByIdempotencyKeys).mockResolvedValue(
      keys.map((idempotencyKey) => ({
        idempotencyKey,
        status: 'NOT_FOUND' as const,
      })),
    );

    const result = await lookupOperatorOrders(adapter, keys);

    expect(adapter.getOrdersByIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(100);
    expect(result.get('key-99')).toEqual({
      idempotencyKey: 'key-99',
      status: 'NOT_FOUND',
    });
  });

  it('distingue une panne de lecture de NOT_FOUND pour chaque clé', async () => {
    const adapter = port();
    jest
      .mocked(adapter.getOrdersByIdempotencyKeys)
      .mockRejectedValue(new Error('timeout Bearer secret'));

    const result = await lookupOperatorOrders(adapter, ['a', 'b']);

    expect([...result.values()]).toEqual([
      { idempotencyKey: 'a', status: 'LOOKUP_FAILED', reason: '[REDACTED]' },
      { idempotencyKey: 'b', status: 'LOOKUP_FAILED', reason: '[REDACTED]' },
    ]);
  });

  it('traite une clé absente de la réponse groupée comme LOOKUP_FAILED', async () => {
    const adapter = port();
    jest
      .mocked(adapter.getOrdersByIdempotencyKeys)
      .mockResolvedValue([{ idempotencyKey: 'a', status: 'NOT_FOUND' }]);

    const result = await lookupOperatorOrders(adapter, ['a', 'b']);

    expect(result.get('b')).toMatchObject({ status: 'LOOKUP_FAILED' });
  });
});

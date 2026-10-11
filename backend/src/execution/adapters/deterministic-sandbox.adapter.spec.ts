import { isWellFormedAcceptance, PlaceOrderRequest } from '../operator.port';
import {
  DeterministicSandboxAdapter,
  SandboxTimeoutError,
} from './deterministic-sandbox.adapter';

const request = (key: string): PlaceOrderRequest => ({
  decisionId: 'd1',
  idempotencyKey: key,
  operatorKey: 'sandbox',
  fixtureId: 'f1',
  providerFixtureId: '100',
  marketKey: '1X2',
  selectionKey: 'HOME',
  requestedOdd: 2,
  minimumOdd: 1.9,
  stake: '10.00',
  currency: 'EUR',
  quoteCapturedAt: new Date(),
});

describe('DeterministicSandboxAdapter', () => {
  let sandbox: DeterministicSandboxAdapter;
  beforeEach(() => {
    sandbox = new DeterministicSandboxAdapter();
    sandbox.fund('EUR', '100.00');
  });

  it('accepte par défaut, déduplique par clé et suit le solde', async () => {
    const first = await sandbox.placeOrder(request('k1'));
    const again = await sandbox.placeOrder(request('k1'));
    expect(isWellFormedAcceptance(first)).toBe(true);
    expect(again).toEqual(first);
    expect(sandbox.placementsFor('k1')).toBe(1);
    expect(sandbox.placeCallsFor('k1')).toBe(2);
    await expect(sandbox.getBalance('EUR')).resolves.toEqual({
      currency: 'EUR',
      available: '90.00',
      exposure: '10.00',
    });
    const ext = first.status === 'ACCEPTED' ? first.externalOrderId : '';
    sandbox.settle(ext, 'WON');
    await expect(sandbox.getOrderByExternalId(ext)).resolves.toMatchObject({
      status: 'SETTLED',
      payout: '20.00',
    });
    await expect(sandbox.getBalance('EUR')).resolves.toMatchObject({
      available: '110.00',
      exposure: '0.00',
    });
  });

  it('refus et cote déplacée : rien n’est inscrit', async () => {
    sandbox.enqueue('REJECT', 'ODD_MOVED');
    await expect(sandbox.placeOrder(request('r1'))).resolves.toMatchObject({
      status: 'REJECTED',
    });
    await expect(sandbox.placeOrder(request('r2'))).resolves.toMatchObject({
      status: 'REJECTED',
      reasonCode: 'ODD_MOVED',
    });
    expect(sandbox.placementsFor('r1') + sandbox.placementsFor('r2')).toBe(0);
  });

  it('timeout avant / après acceptation', async () => {
    sandbox.enqueue('TIMEOUT_BEFORE_ACCEPT', 'TIMEOUT_AFTER_ACCEPT');
    await expect(sandbox.placeOrder(request('t1'))).rejects.toThrow(
      SandboxTimeoutError,
    );
    await expect(sandbox.placeOrder(request('t2'))).rejects.toThrow(
      SandboxTimeoutError,
    );
    await expect(sandbox.getOrderByIdempotencyKey('t1')).resolves.toBeNull();
    await expect(sandbox.getOrderByIdempotencyKey('t2')).resolves.toMatchObject(
      { status: 'ACCEPTED' },
    );
  });

  it('visibilité retardée : UNKNOWN, invisible à la première lecture', async () => {
    sandbox.enqueue('DELAYED');
    await expect(sandbox.placeOrder(request('d1'))).resolves.toEqual({
      status: 'UNKNOWN',
      reason: expect.any(String),
    });
    await expect(sandbox.getOrderByIdempotencyKey('d1')).resolves.toBeNull();
    await expect(sandbox.getOrderByIdempotencyKey('d1')).resolves.toMatchObject(
      { status: 'ACCEPTED' },
    );
  });

  it('réponse malformée et reçu dupliqué', async () => {
    sandbox.enqueue('MALFORMED');
    expect(
      isWellFormedAcceptance(await sandbox.placeOrder(request('m1'))),
    ).toBe(false);
    const a = await sandbox.placeOrder(request('a1'));
    sandbox.enqueue('DUPLICATE_RECEIPT');
    const b = await sandbox.placeOrder(request('b1'));
    expect(a.status === 'ACCEPTED' && b.status === 'ACCEPTED').toBe(true);
    if (a.status === 'ACCEPTED' && b.status === 'ACCEPTED') {
      expect(b.receiptHash).toBe(a.receiptHash);
      expect(b.externalOrderId).not.toBe(a.externalOrderId);
    }
  });

  it('cote indisponible et reset', async () => {
    sandbox.setQuoteOdd(null);
    const quoteRequest = {
      target: {} as never,
      at: new Date(),
      maxQuoteAgeMs: 30_000,
    };
    await expect(sandbox.getExecutableQuote(quoteRequest)).resolves.toBeNull();
    sandbox.reset();
    await expect(
      sandbox.getExecutableQuote(quoteRequest),
    ).resolves.toMatchObject({ oddValue: 1.9 });
  });
});

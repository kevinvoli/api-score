import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { DeterministicSandboxAdapter } from './adapters/deterministic-sandbox.adapter';
import {
  ExecutionBlockedError,
  ExecutionControlService,
} from './execution-control.service';
import {
  DECISION_BUCKET_MS,
  SUBMISSION_TIMEOUT_MS,
  SUBMITTING_STALE_MS,
} from './execution.types';
import { LedgerService } from './ledger.service';
import { OperatorPort, isWellFormedAcceptance } from './operator.port';
import {
  OrderExecutionService,
  boundedSubmission,
  decodeOrderCursor,
  orderIdempotencyKey,
  settlementOutcome,
} from './order-execution.service';
import { RiskEngineService } from './risk-engine.service';

const base = {
  mode: 'SANDBOX' as const,
  operatorKey: 'sandbox',
  fixtureId: '11111111-1111-4111-8111-111111111111',
  marketKey: '1X2',
  selectionKey: 'HOME',
  strategyVersion: 'v1',
  decidedAt: new Date(
    Math.floor(Date.UTC(2026, 9, 1, 12) / DECISION_BUCKET_MS) *
      DECISION_BUCKET_MS,
  ),
};

describe('orderIdempotencyKey', () => {
  it('est déterministe et stable dans un créneau de 15 minutes', () => {
    const key = orderIdempotencyKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(orderIdempotencyKey({ ...base })).toBe(key);
    expect(
      orderIdempotencyKey({
        ...base,
        decidedAt: new Date(base.decidedAt.getTime() + DECISION_BUCKET_MS - 1),
      }),
    ).toBe(key);
  });

  it.each([
    [
      'créneau suivant',
      { decidedAt: new Date(base.decidedAt.getTime() + DECISION_BUCKET_MS) },
    ],
    ['mode', { mode: 'SIMULATION' as const }],
    ['opérateur', { operatorKey: 'paper' }],
    ['match', { fixtureId: '22222222-2222-4222-8222-222222222222' }],
    ['marché', { marketKey: 'OU25' }],
    ['sélection', { selectionKey: 'AWAY' }],
    ['version de stratégie', { strategyVersion: 'v2' }],
  ])('change avec %s', (_label, patch) => {
    expect(orderIdempotencyKey({ ...base, ...patch })).not.toBe(
      orderIdempotencyKey(base),
    );
  });
});

describe('settlementOutcome', () => {
  it('gagné, perdu, annulé en centimes exacts', () => {
    expect(settlementOutcome('10.00', '19.00')).toEqual({
      outcome: 'WON',
      profitCents: 900,
    });
    expect(settlementOutcome('10.00', '0.00')).toEqual({
      outcome: 'LOST',
      profitCents: -1000,
    });
    expect(settlementOutcome('10.00', '10.00')).toEqual({
      outcome: 'VOID',
      profitCents: 0,
    });
    expect(settlementOutcome('0.10', '0.30')).toEqual({
      outcome: 'WON',
      profitCents: 20,
    });
  });
});

describe('decodeOrderCursor', () => {
  const id = '8a4f6c1e-0000-4000-8000-000000000000';
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString('base64url');

  it('relit un curseur bien formé', () => {
    expect(decodeOrderCursor(encode(['2026-10-01T00:00:00.000Z', id]))).toEqual(
      {
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        id,
      },
    );
  });

  it.each([
    ['pas du base64 json', 'zzz'],
    ['mauvaise forme', encode({ a: 1 })],
    ['date illisible', encode(['pas-une-date', id])],
    ['id non uuid', encode(['2026-10-01T00:00:00Z', "1' OR 1=1"])],
  ])('refuse %s', (_label, cursor) => {
    expect(() => decodeOrderCursor(cursor)).toThrow(BadRequestException);
  });
});

describe('isWellFormedAcceptance', () => {
  const ok = {
    status: 'ACCEPTED' as const,
    externalOrderId: 'SBX-1',
    acceptedOdd: 1.9,
    acceptedStake: '10.00',
    acceptedAt: new Date(),
    receiptHash: 'a'.repeat(64),
    rawReceipt: {},
  };
  it('accepte une acceptation complète', () => {
    expect(isWellFormedAcceptance(ok)).toBe(true);
  });
  it.each([
    ['cote NaN', { acceptedOdd: Number.NaN }],
    ['cote ≤ 1', { acceptedOdd: 1 }],
    ['mise flottante', { acceptedStake: '10.001' }],
    ['hash vide', { receiptHash: '' }],
    ['id externe vide', { externalOrderId: '' }],
    ['date invalide', { acceptedAt: new Date('x') }],
  ])('refuse %s', (_label, patch) => {
    expect(isWellFormedAcceptance({ ...ok, ...patch })).toBe(false);
  });
  it('un refus ou un UNKNOWN n’est jamais une acceptation', () => {
    expect(isWellFormedAcceptance({ status: 'UNKNOWN', reason: 'x' })).toBe(
      false,
    );
  });
});

describe('OrderExecutionService.portFor', () => {
  const sandbox = new DeterministicSandboxAdapter();
  const paper = {
    kind: 'PAPER',
    operatorKey: 'paper',
  } as unknown as OperatorPort;
  const service = new OrderExecutionService(
    {} as DataSource,
    {} as ExecutionControlService,
    {} as RiskEngineService,
    {} as LedgerService,
    { SIMULATION: paper, SANDBOX: sandbox, LIVE_CANARY: sandbox },
    {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as JsonLogger,
  );

  it('sélectionne l’adaptateur du mode', () => {
    expect(service.portFor('SIMULATION')).toBe(paper);
    expect(service.portFor('SANDBOX')).toBe(sandbox);
  });

  it('refuse LIVE_CANARY même si un adaptateur est câblé, DISABLED et les modes inconnus', () => {
    for (const mode of ['LIVE_CANARY', 'DISABLED', 'LIVE', '']) {
      expect(() => service.portFor(mode)).toThrow(ExecutionBlockedError);
    }
  });
});

describe('boundedSubmission', () => {
  afterEach(() => jest.useRealTimers());

  it('rend la réponse obtenue dans le délai', async () => {
    await expect(boundedSubmission(Promise.resolve('ok'), 1_000)).resolves.toBe(
      'ok',
    );
  });

  it('rejette un appel bloqué au délai, sans attendre sa réponse', async () => {
    jest.useFakeTimers();
    const pending = boundedSubmission(
      new Promise<string>(() => undefined),
      20_000,
    );
    const assertion = expect(pending).rejects.toThrow(
      'Délai de soumission dépassé (20000 ms)',
    );
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it('propage l’erreur de l’appel et ne laisse aucun minuteur actif', async () => {
    jest.useFakeTimers();
    await expect(
      boundedSubmission(Promise.reject(new Error('panne')), 20_000),
    ).rejects.toThrow('panne');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('le délai par défaut du service reste sous le verrou MySQL et sous SUBMITTING_STALE_MS', () => {
    expect(SUBMISSION_TIMEOUT_MS).toBeLessThan(50_000);
    expect(SUBMISSION_TIMEOUT_MS).toBeLessThan(SUBMITTING_STALE_MS);
  });
});

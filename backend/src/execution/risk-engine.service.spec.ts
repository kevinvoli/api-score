import { DataSource } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import {
  ExecutionBlockedError,
  ExecutionControlService,
} from './execution-control.service';
import { LedgerService } from './ledger.service';
import {
  RiskEngineService,
  RiskInput,
  evaluateRisk,
  utcDayStart,
} from './risk-engine.service';

const policy = {
  maxStakePerBet: '10.00',
  maxDailyStake: '50.00',
  maxDailyLoss: '30.00',
  maxOpenExposure: '25.00',
  maxQuoteAgeMs: 5_000,
};

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    policy,
    stakeCents: 1_000,
    availableCents: 100_000,
    reservedCents: 0,
    dailyStakedCents: 0,
    dailySettledPnlCents: 0,
    quoteAgeMs: 1_000,
    ...overrides,
  };
}

describe('evaluateRisk() — limites exactement atteintes / dépassées', () => {
  it('accepte une réservation sous toutes les limites', () => {
    expect(evaluateRisk(input())).toEqual({ ok: true });
  });

  it.each([
    ['mise = plafond par pari', { stakeCents: 1_000 }],
    ['budget du jour atteint pile', { dailyStakedCents: 4_000 }],
    ['exposition atteinte pile', { reservedCents: 1_500 }],
    ['disponible atteint pile', { availableCents: 1_000 }],
    ['cote à l’âge maximal', { quoteAgeMs: 5_000 }],
    [
      'perte du jour sous le maximum d’un centime',
      { dailySettledPnlCents: -2_999 },
    ],
  ])('accepte la limite exactement atteinte : %s', (_label, overrides) => {
    expect(evaluateRisk(input(overrides))).toEqual({ ok: true });
  });

  it.each([
    [
      'plafond par pari +1 centime',
      { stakeCents: 1_001 },
      'MAX_STAKE_PER_BET',
      null,
    ],
    [
      'budget du jour +1 centime',
      { dailyStakedCents: 4_001 },
      'DAILY_STAKE',
      null,
    ],
    [
      'budget du jour déjà épuisé',
      { dailyStakedCents: 5_000 },
      'DAILY_STAKE',
      'DAILY_LIMIT_REACHED',
    ],
    ['exposition +1 centime', { reservedCents: 1_501 }, 'OPEN_EXPOSURE', null],
    [
      'disponible −1 centime',
      { availableCents: 999 },
      'AVAILABLE_BALANCE',
      null,
    ],
    [
      'perte du jour atteinte',
      { dailySettledPnlCents: -3_000 },
      'DAILY_LOSS',
      'DAILY_LIMIT_REACHED',
    ],
    [
      'cote trop vieille d’1 ms',
      { quoteAgeMs: 5_001 },
      'QUOTE_AGE',
      'STALE_OR_SUSPENDED_ODD',
    ],
    [
      'cote datée du futur',
      { quoteAgeMs: -1 },
      'QUOTE_AGE',
      'STALE_OR_SUSPENDED_ODD',
    ],
    ['mise nulle', { stakeCents: 0 }, 'MAX_STAKE_PER_BET', null],
  ])('refuse : %s', (_label, overrides, limit, autoStop) => {
    expect(evaluateRisk(input(overrides))).toMatchObject({
      ok: false,
      limit,
      autoStop,
    });
  });

  it('un gain du jour ne crée pas de « perte négative »', () => {
    expect(evaluateRisk(input({ dailySettledPnlCents: 50_000 }))).toEqual({
      ok: true,
    });
  });
});

describe('utcDayStart()', () => {
  it('début du jour UTC', () => {
    expect(utcDayStart(new Date('2026-10-10T23:59:59.999Z'))).toEqual(
      new Date('2026-10-10T00:00:00.000Z'),
    );
  });
});

describe('RiskEngineService.reserveStake() — fail-closed', () => {
  const request = {
    accountId: 'acc-1',
    entryKey: 'reserve:k1',
    stake: '5.00',
    quoteCapturedAt: new Date(),
  };

  function engine(transaction: jest.Mock) {
    const control = {
      autoStop: jest.fn().mockResolvedValue(true),
    } as unknown as ExecutionControlService & { autoStop: jest.Mock };
    const svc = new RiskEngineService(
      { transaction } as unknown as DataSource,
      control,
      {} as LedgerService,
      {
        error: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
      } as unknown as JsonLogger,
    );
    return { svc, control };
  }

  it('base indisponible : refus et arrêt automatique', async () => {
    const { svc, control } = engine(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    await expect(svc.reserveStake(request)).resolves.toMatchObject({
      status: 'REJECTED',
      code: 'RISK_CHECK_FAILED',
    });
    expect(control.autoStop).toHaveBeenCalledWith('CONTROL_UNREADABLE', {
      cause: 'erreur base',
    });
  });

  it('contrôle arrêté : refus CONTROL_DISABLED, sans nouvel arrêt', async () => {
    const { svc, control } = engine(
      jest
        .fn()
        .mockRejectedValue(
          new ExecutionBlockedError('Exécution arrêtée', false),
        ),
    );

    await expect(svc.reserveStake(request)).resolves.toMatchObject({
      status: 'REJECTED',
      code: 'CONTROL_DISABLED',
      reason: 'Exécution arrêtée',
    });
    expect(control.autoStop).not.toHaveBeenCalled();
  });

  it('contrôle absent ou illisible : refus et arrêt automatique', async () => {
    const { svc, control } = engine(
      jest
        .fn()
        .mockRejectedValue(
          new ExecutionBlockedError('Ligne de contrôle absente', true),
        ),
    );

    await expect(svc.reserveStake(request)).resolves.toMatchObject({
      code: 'CONTROL_DISABLED',
    });
    expect(control.autoStop).toHaveBeenCalledWith('CONTROL_UNREADABLE', {});
  });
});

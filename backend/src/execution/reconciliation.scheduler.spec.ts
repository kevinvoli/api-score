import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ExecutionControlService } from './execution-control.service';
import {
  RECONCILIATION_INTERVAL_NAME,
  RECONCILIATION_LOCK,
  ReconciliationScheduler,
} from './reconciliation.scheduler';
import { ReconciliationService } from './reconciliation.service';

const NOW = new Date('2026-10-01T12:00:00Z');

function setup(
  opts: {
    env?: Record<string, string>;
    acquired?: number;
    accounts?: string[];
    mode?: string;
    lastCompleted?: Array<{ accountId: string; lastCompletedAt: Date | null }>;
    created?: boolean;
  } = {},
) {
  const env = opts.env ?? {};
  const config = { get: jest.fn((k: string) => env[k]) };
  const registry = {
    addInterval: jest.fn(),
    doesExist: jest.fn().mockReturnValue(true),
    deleteInterval: jest.fn(),
  };
  const runnerQuery = jest.fn(async (sql: string) =>
    sql.startsWith('SELECT GET_LOCK') ? [{ acquired: opts.acquired ?? 1 }] : [],
  );
  const runner = {
    connect: jest.fn().mockResolvedValue(undefined),
    query: runnerQuery,
    release: jest.fn().mockResolvedValue(undefined),
  };
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(opts.lastCompleted ?? []),
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(runner),
    query: jest
      .fn()
      .mockResolvedValue(
        (opts.accounts ?? []).map((accountId) => ({ accountId })),
      ),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => qb }),
  };
  const reconciliation = {
    openBatch: jest.fn(async (inputs: Array<{ idempotencyKey: string }>) => ({
      runs: inputs.map((input) => ({
        id: `run-${input.idempotencyKey}`,
      })),
      createdRunIds:
        opts.created === false
          ? []
          : inputs.map((input) => `run-${input.idempotencyKey}`),
    })),
    executeBatch: jest.fn().mockResolvedValue([]),
  };
  const control = {
    readControl: jest.fn().mockResolvedValue({ mode: opts.mode ?? 'DISABLED' }),
    autoStop: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const scheduler = new ReconciliationScheduler(
    config as unknown as ConfigService,
    registry as unknown as SchedulerRegistry,
    dataSource as unknown as DataSource,
    reconciliation as unknown as ReconciliationService,
    control as unknown as ExecutionControlService,
    logger as unknown as JsonLogger,
  );
  return {
    scheduler,
    registry,
    runner,
    dataSource,
    reconciliation,
    control,
    logger,
  };
}

describe('ReconciliationScheduler', () => {
  it('désactivé par défaut : aucun intervalle enregistré', () => {
    const { scheduler, registry } = setup();
    scheduler.onModuleInit();
    expect(registry.addInterval).not.toHaveBeenCalled();
  });

  it('activé : intervalle borné à 60 s minimum', () => {
    jest.useFakeTimers();
    try {
      const { scheduler, registry } = setup({
        env: {
          RECONCILIATION_SCHEDULER_ENABLED: 'true',
          RECONCILIATION_INTERVAL_MS: '1000',
        },
      });
      expect(scheduler.intervalMs()).toBe(60_000);
      scheduler.onModuleInit();
      expect(registry.addInterval).toHaveBeenCalledWith(
        RECONCILIATION_INTERVAL_NAME,
        expect.anything(),
      );
      scheduler.onModuleDestroy();
      expect(registry.deleteInterval).toHaveBeenCalledWith(
        RECONCILIATION_INTERVAL_NAME,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('intervalle illisible → défaut 5 min', () => {
    const { scheduler } = setup({ env: { RECONCILIATION_INTERVAL_MS: 'abc' } });
    expect(scheduler.intervalMs()).toBe(300_000);
  });

  it('verrou tenu par une autre instance : rien n’est fait', async () => {
    const { scheduler, reconciliation, runner } = setup({
      acquired: 0,
      accounts: ['a1'],
    });
    await expect(scheduler.runTick(NOW)).resolves.toBe('SKIPPED_LOCKED');
    expect(reconciliation.openBatch).not.toHaveBeenCalled();
    expect(runner.query).not.toHaveBeenCalledWith(
      'SELECT RELEASE_LOCK(?)',
      expect.anything(),
    );
    expect(runner.release).toHaveBeenCalled();
  });

  it('tick concurrent dans le même process : ignoré', async () => {
    const { scheduler } = setup({ accounts: ['a1'] });
    const first = scheduler.runTick(NOW);
    await expect(scheduler.runTick(NOW)).resolves.toBe('SKIPPED_LOCAL');
    await expect(first).resolves.toBe('DONE');
  });

  it('un run idempotent par compte et par créneau, exécuté seulement à la création', async () => {
    const { scheduler, reconciliation, runner } = setup({
      accounts: ['a1', 'a2'],
    });
    await expect(scheduler.runTick(NOW)).resolves.toBe('DONE');
    const bucket = Math.floor(NOW.getTime() / 300_000);
    expect(reconciliation.openBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: 'a1',
          idempotencyKey: `auto:a1:${bucket}`,
        }),
      ]),
      null,
    );
    expect(reconciliation.openBatch).toHaveBeenCalledTimes(1);
    expect(reconciliation.executeBatch).toHaveBeenCalledTimes(1);
    expect(reconciliation.executeBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        `run-auto:a1:${bucket}`,
        `run-auto:a2:${bucket}`,
      ]),
      NOW,
    );
    expect(runner.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      RECONCILIATION_LOCK,
    ]);

    const replay = setup({ accounts: ['a1'], created: false });
    await replay.scheduler.runTick(NOW);
    expect(replay.reconciliation.executeBatch).toHaveBeenCalledWith([], NOW);
  });

  it('une panne du batch arrête l’exécution, reste capturée et relâche le verrou', async () => {
    const { scheduler, reconciliation, runner, logger, control } = setup({
      accounts: ['a1', 'a2'],
    });
    reconciliation.openBatch.mockRejectedValueOnce(new Error('boom'));
    await expect(scheduler.runTick(NOW)).resolves.toBe('FAILED');
    expect(reconciliation.executeBatch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    expect(control.autoStop).toHaveBeenCalledWith('CONTROL_UNREADABLE', {
      source: 'reconciliation_scheduler',
    });
    expect(runner.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      RECONCILIATION_LOCK,
    ]);
  });

  it('le nombre d’appels métier reste constant avec 100 comptes', async () => {
    const accounts = Array.from({ length: 100 }, (_, index) => `a${index}`);
    const { scheduler, reconciliation } = setup({ accounts });
    await expect(scheduler.runTick(NOW)).resolves.toBe('DONE');
    expect(reconciliation.openBatch).toHaveBeenCalledTimes(1);
    expect(reconciliation.executeBatch).toHaveBeenCalledTimes(1);
  });

  it('retard : arrêt RECONCILIATION_LATE si exécution active et pas de run complété récent', async () => {
    const late = setup({
      accounts: ['a1', 'a2'],
      mode: 'SANDBOX',
      lastCompleted: [
        { accountId: 'a1', lastCompletedAt: new Date(NOW.getTime() - 60_000) },
        {
          accountId: 'a2',
          lastCompletedAt: new Date(NOW.getTime() - 3_600_000),
        },
      ],
    });
    await late.scheduler.runTick(NOW);
    expect(late.control.autoStop).toHaveBeenCalledWith('RECONCILIATION_LATE', {
      accounts: 1,
    });

    const disabled = setup({ accounts: ['a1'], mode: 'DISABLED' });
    await disabled.scheduler.runTick(NOW);
    expect(disabled.control.autoStop).not.toHaveBeenCalled();

    const fresh = setup({
      accounts: ['a1'],
      mode: 'SIMULATION',
      lastCompleted: [{ accountId: 'a1', lastCompletedAt: NOW }],
    });
    await fresh.scheduler.runTick(NOW);
    expect(fresh.control.autoStop).not.toHaveBeenCalled();
  });
});

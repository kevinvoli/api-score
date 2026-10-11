import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { JsonLogger } from '../common/json.logger';
import { ExecutionControl } from '../database/entities/execution-control.entity';
import {
  ExecutionBlockedError,
  ExecutionControlService,
  executionAllowed,
  sanitizeReason,
  toSnapshot,
} from './execution-control.service';
import { isRealMoneyInterlockOpen } from './execution.types';
import { GatePolicyService } from './gate-policy.service';

function control(overrides: Partial<ExecutionControl> = {}): ExecutionControl {
  return {
    id: 'c1',
    scope: 'GLOBAL',
    mode: 'SIMULATION',
    version: 4,
    activeRiskPolicyId: 'p1',
    stopReason: null,
    stopSource: null,
    changedByUserId: 'admin-1',
    changedAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  } as ExecutionControl;
}

function service(
  dataSource: Partial<DataSource>,
  env: Record<string, string | undefined> = {},
) {
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    logger,
    service: new ExecutionControlService(
      dataSource as DataSource,
      {} as GatePolicyService,
      { get: (key: string) => env[key] } as unknown as ConfigService,
      { getTraceId: () => undefined } as unknown as AsyncContextService,
      logger as unknown as JsonLogger,
    ),
  };
}

describe('toSnapshot() — lecture fail-closed', () => {
  it('lit un contrôle valide tel quel', () => {
    expect(toSnapshot(control(), false)).toMatchObject({
      readable: true,
      mode: 'SIMULATION',
      version: 4,
    });
  });

  it('contrôle absent → DISABLED, illisible', () => {
    expect(toSnapshot(null, true)).toMatchObject({
      readable: false,
      mode: 'DISABLED',
      stopReason: 'Ligne de contrôle absente',
    });
  });

  it('mode inconnu en base → DISABLED, illisible', () => {
    expect(toSnapshot(control({ mode: 'LIVE' }), true)).toMatchObject({
      readable: false,
      mode: 'DISABLED',
      stopReason: 'Mode inconnu en base : LIVE',
    });
  });
});

describe('executionAllowed() et interlock', () => {
  it('DISABLED n’engage jamais rien, même interlock ouvert', () => {
    expect(executionAllowed('DISABLED', true)).toBe(false);
  });

  it('LIVE_CANARY exige l’interlock ; les autres modes non', () => {
    expect(executionAllowed('LIVE_CANARY', false)).toBe(false);
    expect(executionAllowed('LIVE_CANARY', true)).toBe(true);
    expect(executionAllowed('SIMULATION', false)).toBe(true);
    expect(executionAllowed('SANDBOX', false)).toBe(true);
  });

  it.each([undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true'])(
    'interlock fermé pour %p : seule la chaîne exacte "true" l’ouvre',
    (raw) => {
      expect(isRealMoneyInterlockOpen(raw)).toBe(false);
    },
  );
});

describe('sanitizeReason() — audit expurgé', () => {
  it('une ligne, sans caractères de contrôle, bornée à 500', () => {
    expect(sanitizeReason('  arrêt\r\nmanuel\t ')).toBe('arrêt manuel');
    expect(sanitizeReason('x'.repeat(800))).toHaveLength(500);
  });
});

describe('ExecutionControlService.readControl()', () => {
  it('base indisponible → DISABLED illisible, sans lever', async () => {
    const { service: svc, logger } = service({
      getRepository: () =>
        ({
          findOneBy: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        }) as never,
    });

    await expect(svc.readControl()).resolves.toMatchObject({
      readable: false,
      mode: 'DISABLED',
      stopReason: 'Contrôle illisible (base indisponible)',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('contrôle absent → DISABLED', async () => {
    const { service: svc } = service({
      getRepository: () =>
        ({ findOneBy: jest.fn().mockResolvedValue(null) }) as never,
    });
    await expect(svc.readControl()).resolves.toMatchObject({
      mode: 'DISABLED',
      readable: false,
    });
  });

  it('expose l’état de l’interlock lu à chaque appel, fermé par défaut', async () => {
    const env: Record<string, string | undefined> = {};
    const { service: svc } = service(
      {
        getRepository: () =>
          ({ findOneBy: jest.fn().mockResolvedValue(control()) }) as never,
      },
      env,
    );
    expect((await svc.readControl()).realMoneyInterlockOpen).toBe(false);
    env.REAL_MONEY_INTERLOCK = 'true';
    expect((await svc.readControl()).realMoneyInterlockOpen).toBe(true);
  });

  it('au démarrage, un contrôle illisible est journalisé comme tel', async () => {
    const { service: svc, logger } = service({
      getRepository: () =>
        ({
          findOneBy: jest.fn().mockRejectedValue(new Error('down')),
        }) as never,
    });
    await svc.onApplicationBootstrap();
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'execution_control_unreadable',
        mode: 'DISABLED',
      }),
      'ExecutionControlService',
    );
  });

  it('autoStop ne lève jamais, même base indisponible', async () => {
    const { service: svc, logger } = service({
      transaction: jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as never,
    });
    await expect(svc.autoStop('CONTROL_UNREADABLE')).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'execution_auto_stop_failed' }),
      expect.any(String),
      'ExecutionControlService',
    );
  });
});

describe('tolérance d’horloge', () => {
  const managerAt = (offsetMs: number) =>
    ({
      query: jest.fn(async () => [{ now: new Date(Date.now() + offsetMs) }]),
    }) as never;

  it('accepte un écart sous la tolérance', async () => {
    const { service: svc } = service({});
    await expect(
      svc.assertClockWithinTolerance(managerAt(500)),
    ).resolves.toBeUndefined();
  });

  it.each([5_000, -5_000])(
    'bloque un écart de %p ms avec la base',
    async (offset) => {
      const { service: svc } = service({});
      await expect(
        svc.assertClockWithinTolerance(managerAt(offset)),
      ).rejects.toThrow(ExecutionBlockedError);
    },
  );
});

describe('barrière de soumission et kill switch', () => {
  it('un arrêt attend la soumission engagée puis interdit tout nouvel appel', async () => {
    const state = control();
    let activeSubmission = 0;
    let releaseWriter: (() => void) | null = null;
    const writerReady = () =>
      activeSubmission === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            releaseWriter = resolve;
          });
    const executionRepo = {
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => ({ ...state })),
      })),
      findOneByOrFail: jest.fn(async () => ({ ...state })),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === ExecutionControl
          ? executionRepo
          : { insert: jest.fn().mockResolvedValue(undefined) },
      ),
      query: jest.fn(async (sql: string) => {
        if (sql.includes("SET mode = 'DISABLED'")) {
          state.mode = 'DISABLED';
          state.version += 1;
        }
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (
          isolationOrWork:
            | string
            | ((transactionManager: typeof manager) => Promise<unknown>),
          maybeWork?: (transactionManager: typeof manager) => Promise<unknown>,
        ) => {
          if (typeof isolationOrWork === 'string') {
            activeSubmission += 1;
            try {
              return await maybeWork!(manager);
            } finally {
              activeSubmission -= 1;
              if (activeSubmission === 0) releaseWriter?.();
            }
          }
          await writerReady();
          return isolationOrWork(manager);
        },
      ),
    };
    const { service: svc } = service(
      dataSource as unknown as Partial<DataSource>,
    );
    let enterPlacement: (() => void) | null = null;
    const placementEntered = new Promise<void>((resolve) => {
      enterPlacement = resolve;
    });
    let finishPlacement: (() => void) | null = null;
    const placementBlocked = new Promise<void>((resolve) => {
      finishPlacement = resolve;
    });
    const placement = svc.withSubmissionPermit('SIMULATION', async () => {
      enterPlacement?.();
      await placementBlocked;
      return 'accepted';
    });
    await placementEntered;

    let stopCompleted = false;
    const stopping = svc.stop('urgence', 'admin').then(() => {
      stopCompleted = true;
    });
    await Promise.resolve();
    expect(stopCompleted).toBe(false);

    finishPlacement?.();
    await expect(placement).resolves.toBe('accepted');
    await stopping;
    expect(state.mode).toBe('DISABLED');

    const placeAfterStop = jest.fn().mockResolvedValue('forbidden');
    await expect(
      svc.withSubmissionPermit('SIMULATION', placeAfterStop),
    ).rejects.toThrow(ExecutionBlockedError);
    expect(placeAfterStop).not.toHaveBeenCalled();
  });
});

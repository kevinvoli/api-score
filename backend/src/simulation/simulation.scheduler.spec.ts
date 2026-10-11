import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JsonLogger } from '../common/json.logger';
import {
  SIMULATION_INTERVAL_NAME,
  SimulationScheduler,
} from './simulation.scheduler';
import { SimulationService } from './simulation.service';

function setup(env: Record<string, string | undefined> = {}) {
  const simulation = {
    activeRunIds: jest.fn().mockResolvedValue(['run-a', 'run-b']),
    tick: jest.fn().mockResolvedValue({ decided: 0, executed: 0, settled: 0 }),
  };
  const registry = new SchedulerRegistry();
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const scheduler = new SimulationScheduler(
    { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService,
    registry,
    simulation as unknown as SimulationService,
    logger as unknown as JsonLogger,
  );
  return { scheduler, simulation, registry, logger };
}

describe('SimulationScheduler', () => {
  afterEach(() => jest.useRealTimers());

  it('reste désactivé par défaut : aucun intervalle', () => {
    const { scheduler, registry } = setup();
    scheduler.onModuleInit();

    expect(registry.doesExist('interval', SIMULATION_INTERVAL_NAME)).toBe(
      false,
    );
  });

  it('s’active explicitement, borne l’intervalle et le libère à l’arrêt', () => {
    jest.useFakeTimers();
    const { scheduler, registry, simulation } = setup({
      SIMULATION_SCHEDULER_ENABLED: 'true',
      SIMULATION_TICK_INTERVAL_MS: '10',
    });
    scheduler.onModuleInit();
    expect(registry.doesExist('interval', SIMULATION_INTERVAL_NAME)).toBe(true);

    jest.advanceTimersByTime(4_999);
    expect(simulation.activeRunIds).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(simulation.activeRunIds).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
    expect(registry.doesExist('interval', SIMULATION_INTERVAL_NAME)).toBe(
      false,
    );
  });

  it('fait avancer chaque run actif au même instant', async () => {
    const { scheduler, simulation } = setup();
    const now = new Date('2026-10-10T15:00:00.000Z');

    await scheduler.runTick(now);

    expect(simulation.tick.mock.calls).toEqual([
      ['run-a', now],
      ['run-b', now],
    ]);
  });

  it('double tick simultané dans le processus : le second est ignoré', async () => {
    const { scheduler, simulation } = setup();
    let release: () => void = () => undefined;
    simulation.tick.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(null))),
    );

    const first = scheduler.runTick();
    await new Promise((resolve) => setImmediate(resolve));
    await scheduler.runTick();
    release();
    await first;

    expect(simulation.activeRunIds).toHaveBeenCalledTimes(1);
  });

  it('l’échec d’un run n’empêche pas les suivants et n’arrête pas le scheduler', async () => {
    const { scheduler, simulation, logger } = setup();
    simulation.tick.mockRejectedValueOnce(new Error('verrou expiré'));

    await scheduler.runTick();
    await scheduler.runTick();

    expect(simulation.tick).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'simulation_tick_failed',
        runId: 'run-a',
      }),
      expect.any(String),
      'SimulationScheduler',
    );
  });

  it('survit à une panne de lecture des runs actifs', async () => {
    const { scheduler, simulation } = setup();
    simulation.activeRunIds.mockRejectedValueOnce(
      new Error('SGBD indisponible'),
    );

    await expect(scheduler.runTick()).resolves.toBeUndefined();
    await scheduler.runTick();
    expect(simulation.tick).toHaveBeenCalledTimes(2);
  });
});

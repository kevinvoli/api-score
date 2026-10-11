import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JsonLogger } from '../common/json.logger';
import { SimulationService } from './simulation.service';

export const SIMULATION_INTERVAL_NAME = 'simulation-tick';
const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 600_000;

/**
 * Fait avancer les runs de simulation. Désactivé par défaut
 * (`SIMULATION_SCHEDULER_ENABLED=true` pour l'activer). L'idempotence ne repose
 * pas sur ce scheduler : un tick concurrent (autre instance, tick en retard) est
 * sérialisé par le verrou SQL du run.
 */
@Injectable()
export class SimulationScheduler implements OnModuleInit, OnModuleDestroy {
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly simulation: SimulationService,
    private readonly logger: JsonLogger,
  ) {}

  onModuleInit(): void {
    if (
      this.configService.get<string>('SIMULATION_SCHEDULER_ENABLED') !== 'true'
    ) {
      this.logger.log(
        { event: 'simulation_scheduler_disabled' },
        'SimulationScheduler',
      );
      return;
    }
    const intervalMs = this.intervalMs();
    const ref = setInterval(() => {
      void this.runTick();
    }, intervalMs);
    this.schedulerRegistry.addInterval(SIMULATION_INTERVAL_NAME, ref);
    this.logger.log(
      { event: 'simulation_scheduler_started', intervalMs },
      'SimulationScheduler',
    );
  }

  onModuleDestroy(): void {
    if (
      this.schedulerRegistry.doesExist('interval', SIMULATION_INTERVAL_NAME)
    ) {
      this.schedulerRegistry.deleteInterval(SIMULATION_INTERVAL_NAME);
    }
  }

  /** Un passage sur tous les runs actifs ; l'échec d'un run n'empêche pas les autres. */
  async runTick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const runIds = await this.simulation.activeRunIds();
      for (const runId of runIds) {
        try {
          await this.simulation.tick(runId, now);
        } catch (error) {
          this.logger.error(
            { event: 'simulation_tick_failed', runId },
            error instanceof Error ? error.stack : undefined,
            'SimulationScheduler',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { event: 'simulation_scheduler_failed' },
        error instanceof Error ? error.stack : undefined,
        'SimulationScheduler',
      );
    } finally {
      this.running = false;
    }
  }

  private intervalMs(): number {
    const raw = Number(
      this.configService.get<string>('SIMULATION_TICK_INTERVAL_MS') ??
        DEFAULT_INTERVAL_MS,
    );
    if (!Number.isInteger(raw)) return DEFAULT_INTERVAL_MS;
    return Math.min(Math.max(raw, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
  }
}

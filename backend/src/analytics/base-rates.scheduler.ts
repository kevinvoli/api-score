import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JsonLogger } from '../common/json.logger';
import { BaseRatesService } from './base-rates.service';

@Injectable()
export class BaseRatesScheduler {
  private isRunning = false;

  constructor(
    private readonly baseRatesService: BaseRatesService,
    private readonly logger: JsonLogger,
  ) {}

  /** Recalcul mensuel : l'historique bouge lentement, un taux de base ne se recalcule pas en continu. */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async monthlyRecompute(): Promise<void> {
    await this.recompute('cron');
  }

  /** Déclenchement manuel (endpoint) : refuse un lancement concurrent. */
  async recompute(trigger: 'cron' | 'manual'): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        { event: 'base_rates_recompute_skipped', reason: 'already_running' },
        'BaseRatesScheduler',
      );
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.baseRatesService.recomputeAll();
      this.logger.log(
        { event: 'base_rates_recompute_done', trigger, ...result },
        'BaseRatesScheduler',
      );
    } catch (error) {
      this.logger.error(
        { event: 'base_rates_recompute_failed', trigger },
        error instanceof Error ? error.stack : undefined,
        'BaseRatesScheduler',
      );
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}

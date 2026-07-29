import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ApiUsageLog } from '../../database/entities/api-usage-log.entity';

/**
 * Garde-fou de quota partagé entre tout ce qui appelle le provider (sync live,
 * import historique...). Extrait de FixturesSyncScheduler le 20/07/2026 pour
 * éviter de dupliquer la logique dans le nouveau HistoryImportService.
 */
@Injectable()
export class RateBudgetService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  async hasBudget(): Promise<boolean> {
    const perMinuteLimit = this.configService.get<number>(
      'RATE_LIMIT_PER_MIN',
      300,
    );
    const headroomPct = this.configService.get<number>(
      'SYNC_RATE_LIMIT_HEADROOM_PCT',
      90,
    );
    const budget = Math.floor((perMinuteLimit * headroomPct) / 100);
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const callsLastMinute = await this.apiUsageLogRepository.count({
      where: {
        calledAt: MoreThanOrEqual(oneMinuteAgo),
      },
    });

    return callsLastMinute < budget;
  }
}

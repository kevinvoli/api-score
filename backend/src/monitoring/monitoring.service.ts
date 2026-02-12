import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';

@Injectable()
export class MonitoringService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  async getHealth(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    time: string;
    uptime: number;
    db: 'up' | 'down';
  }> {
    const now = new Date();
    let dbStatus: 'up' | 'down' = 'up';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      time: now.toISOString(),
      uptime: Math.round(process.uptime()),
      db: dbStatus,
    };
  }

  async getUsageMetrics(): Promise<{
    apiCallsLastHour: number;
    apiErrorsLastHour: number;
    lastProviderCallAt: string | null;
  }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const apiCallsLastHour = await this.apiUsageLogRepository.count({
      where: {
        calledAt: MoreThanOrEqual(oneHourAgo),
      },
    });

    const apiErrorsLastHour = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .where('log.calledAt >= :oneHourAgo', { oneHourAgo })
      .andWhere('log.responseStatus >= :status', { status: 400 })
      .getCount();

    const lastProviderCall = await this.apiUsageLogRepository.findOne({
      order: { calledAt: 'DESC' },
      select: { calledAt: true },
    });

    return {
      apiCallsLastHour,
      apiErrorsLastHour,
      lastProviderCallAt: lastProviderCall?.calledAt?.toISOString() ?? null,
    };
  }
}

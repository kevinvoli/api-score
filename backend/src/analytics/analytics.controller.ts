import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { BaseRate } from '../database/entities/base-rate.entity';
import { AnalyticsService } from './analytics.service';
import { BaseRatesService } from './base-rates.service';
import { BaseRatesScheduler } from './base-rates.scheduler';

function toIntOrUndefined(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly baseRatesService: BaseRatesService,
    private readonly baseRatesScheduler: BaseRatesScheduler,
  ) {}

  @Get('base-rates')
  getBaseRates(
    @Query('leagueId') leagueId?: string,
    @Query('season') season?: string,
    @Query('market') market?: string,
    @Query('signal') signal?: string,
  ): Promise<BaseRate[]> {
    return this.baseRatesService.findRates({
      leagueId: toIntOrUndefined(leagueId),
      season: toIntOrUndefined(season),
      market: market || undefined,
      signal: signal || undefined,
    });
  }

  @Post('base-rates/recompute')
  @HttpCode(202)
  recomputeBaseRates(): { status: 'accepted' } {
    // Fire-and-forget : le recalcul balaie tout l'historique, on ne bloque pas la requête.
    void this.baseRatesScheduler.recompute('manual');
    return { status: 'accepted' };
  }

  @Get('fixtures/latest')
  getLatest(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 10;
    return this.analyticsService.getLatest(Number.isNaN(parsed) ? 10 : parsed);
  }

  @Get('fixtures/:fixtureId')
  getLatestForFixture(@Param('fixtureId', ParseUUIDPipe) fixtureId: string) {
    return this.analyticsService.getLatestForFixture(fixtureId);
  }

  @Post('fixtures/:fixtureId/recompute')
  recompute(@Param('fixtureId', ParseUUIDPipe) fixtureId: string) {
    return this.analyticsService.recomputeFixture(fixtureId);
  }

  @Post('fixtures/recompute-latest')
  recomputeLatest(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 10;
    return this.analyticsService.recomputeLatest(
      Number.isNaN(parsed) ? 10 : parsed,
    );
  }
}

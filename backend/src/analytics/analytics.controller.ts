import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

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

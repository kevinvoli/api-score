import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { GetFixturesHistoryQueryDto } from './dto/get-fixtures-history-query.dto';
import { GetLiveFixturesQueryDto } from './dto/get-live-fixtures-query.dto';
import { FixturesIngestionService } from './fixtures-ingestion.service';
import { SmartSuggestionsService } from '../recommendations/smart-suggestions.service';

@Controller('live/fixtures')
export class FixturesController {
  constructor(
    private readonly fixturesIngestionService: FixturesIngestionService,
    private readonly smartSuggestionsService: SmartSuggestionsService,
  ) {}

  @Post('sync')
  async syncLiveFixtures() {
    const result = await this.fixturesIngestionService.syncLiveFixtures();
    // Génère les nouvelles suggestions ET résout les coupons PENDING
    // (buts marqués en live + matchs terminés → WON/LOST)
    await this.smartSuggestionsService.evaluateAndSave().catch((err: unknown) => {
      // evaluateAndSave appelle toujours resolveSettledCoupons en finally,
      // donc la résolution s'est exécutée même si la génération a échoué.
      void err;
    });
    return result;
  }

  @Get()
  getLatestFixtures(@Query() query: GetLiveFixturesQueryDto) {
    return this.fixturesIngestionService.getLatestFixtures(query);
  }

  @Get('history')
  getFixturesHistory(@Query() query: GetFixturesHistoryQueryDto) {
    return this.fixturesIngestionService.getFixturesHistory(query);
  }

  @Get(':fixtureId/events')
  getFixtureEvents(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixtureEvents(fixtureId);
  }

  @Get(':fixtureId/lineups')
  getFixtureLineups(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixtureLineups(fixtureId);
  }

  @Get(':fixtureId/players')
  getFixturePlayers(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixturePlayers(fixtureId);
  }

  @Get(':fixtureId/stats/latest')
  getFixtureLatestStats(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixtureLatestStats(fixtureId);
  }

  @Get(':fixtureId/summary')
  getFixtureSummary(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixtureSummary(fixtureId);
  }

  @Get(':fixtureId/detail')
  getFixtureDetail(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    return this.fixturesIngestionService.getFixtureDetail(fixtureId);
  }
}

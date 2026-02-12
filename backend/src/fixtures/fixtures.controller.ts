import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { GetLiveFixturesQueryDto } from './dto/get-live-fixtures-query.dto';
import { FixturesIngestionService } from './fixtures-ingestion.service';

@Controller('live/fixtures')
export class FixturesController {
  constructor(private readonly fixturesIngestionService: FixturesIngestionService) {}

  @Post('sync')
  syncLiveFixtures() {
    return this.fixturesIngestionService.syncLiveFixtures();
  }

  @Get()
  getLatestFixtures(@Query() query: GetLiveFixturesQueryDto) {
    return this.fixturesIngestionService.getLatestFixtures(query);
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

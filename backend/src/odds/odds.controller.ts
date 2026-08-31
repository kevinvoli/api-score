import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { GetOddsHistoryQueryDto } from './dto/get-odds-history-query.dto';
import { OddsService } from './odds.service';

@Controller('odds')
export class OddsController {
  constructor(private readonly oddsService: OddsService) {}

  @Get('fixtures/:id')
  getLatestOdds(@Param('id', ParseIntPipe) id: number) {
    return this.oddsService.getLatestOdds(id);
  }

  @Get('fixtures/:id/history')
  getOddsHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GetOddsHistoryQueryDto,
  ) {
    return this.oddsService.getOddsHistory(id, query);
  }
}

import { Controller, Get } from '@nestjs/common';
import { MatchService } from './match.service';

@Controller('match')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get('live')
  async getLiveMatches() {
    const matches = await this.matchService.fetchLiveMatches();
    const filteredMatches = this.matchService.filterMatches(matches);
    const coupons = this.matchService.generateCoupons(filteredMatches);
    return { count: coupons.length, coupons };
  }
}

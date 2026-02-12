import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MatchService } from './match.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Controller('match')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get('live')
  async getLiveMatches() {
    const matches = await this.matchService.fetchLiveMatches();
    const filteredMatches = this.matchService.filterMatches(matches);
    const coupons = this.matchService.generateCoupons(filteredMatches);
    return { count: coupons.length, coupons};
  }


  @Post()
  create(@Body() createMatchDto: CreateMatchDto) {
    return this.matchService.create(createMatchDto);
  }

 
}

import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MatchService } from '../match.service';
import { CreateMatchDto } from './dto/create-match.dto';


@Controller('match')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get('live')
  async getLiveMatches() {
    const coupons = await this.matchService.getLiveMatches();
    return { count: coupons.length, coupons};
  }


  @Post()
  create(@Body() createMatchDto: CreateMatchDto) {
    return this.matchService.create(createMatchDto);
  }
 
}

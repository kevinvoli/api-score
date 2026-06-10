import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  getTeams(
    @Query('leagueId') leagueId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLeague = leagueId ? Number(leagueId) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.teamsService.getTeams({
      leagueId: Number.isNaN(parsedLeague as number) ? undefined : parsedLeague,
      limit: Number.isNaN(parsedLimit as number) ? undefined : parsedLimit,
    });
  }

  @Get(':teamKey')
  getTeam(@Param('teamKey', ParseIntPipe) teamKey: number) {
    return this.teamsService.getTeamByKey(teamKey);
  }

  @Get(':teamKey/full')
  async getTeamFull(@Param('teamKey', ParseIntPipe) teamKey: number) {
    const team = await this.teamsService.getTeamByKey(teamKey);
    return team;
  }
}

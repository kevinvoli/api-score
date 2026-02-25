import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { ProviderPersistenceService } from './provider-persistence.service';

@Controller('provider')
export class ProviderController {
  constructor(
    private readonly apiFootballClient: ApiFootballClient,
    private readonly persistence: ProviderPersistenceService,
  ) {}

  @Get('countries')
  async getCountries() {
    const countries = await this.apiFootballClient.fetchCountries();
    if (countries.length) {
      await this.persistence.persistCountries(countries);
    }
    return countries;
  }

  @Get('leagues')
  async getLeagues(@Query('countryId') countryId?: string) {
    const parsedCountry = countryId ? Number(countryId) : undefined;
    if (countryId && Number.isNaN(parsedCountry)) {
      throw new BadRequestException('countryId must be a number');
    }
    const leagues = await this.apiFootballClient.fetchLeagues(parsedCountry);
    if (leagues.length) {
      await this.persistence.persistLeagues(leagues);
    }
    return leagues;
  }

  @Get('teams')
  async getTeams(@Query('leagueId') leagueId?: string) {
    if (!leagueId) {
      throw new BadRequestException('leagueId is required');
    }
    const parsedLeague = Number(leagueId);
    if (Number.isNaN(parsedLeague)) {
      throw new BadRequestException('leagueId must be a number');
    }
    const teams = await this.apiFootballClient.fetchTeamsByLeague(parsedLeague);
    await this.persistence.persistTeams(parsedLeague, teams);
    return teams;
  }

  @Get('matches')
  async getMatches(@Query('leagueId') leagueId?: string) {
    if (!leagueId) {
      throw new BadRequestException('leagueId is required');
    }
    const parsedLeague = Number(leagueId);
    if (Number.isNaN(parsedLeague)) {
      throw new BadRequestException('leagueId must be a number');
    }
    const matches = await this.apiFootballClient.fetchLeagueFixtures(parsedLeague);
    if (matches.length) {
      await this.persistence.persistMatches(parsedLeague, matches);
    }
    return matches;
  }
}

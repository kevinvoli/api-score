import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { ProviderPersistenceService } from './provider-persistence.service';

@Controller('provider')
export class ProviderController {
  constructor(
    private readonly apiFootballClient: ApiFootballClient,
    private readonly persistence: ProviderPersistenceService,
  ) {}

  /**
   * Countries — cache-first.
   * Served from DB unless `?refresh=true` is passed or DB is empty.
   */
  @Get('countries')
  async getCountries(@Query('refresh') refresh?: string) {
    if (refresh !== 'true') {
      const cached = await this.persistence.findAllCountries();
      if (cached.length) return cached;
    }
    const countries = await this.apiFootballClient.fetchCountries();
    if (countries.length) await this.persistence.persistCountries(countries);
    return this.persistence.findAllCountries();
  }

  /**
   * Leagues — cache-first per country.
   * Served from DB unless `?refresh=true` or DB has no entries for this country.
   */
  @Get('leagues')
  async getLeagues(
    @Query('countryId') countryId?: string,
    @Query('refresh') refresh?: string,
  ) {
    const parsedCountry = countryId ? Number(countryId) : undefined;
    if (countryId && Number.isNaN(parsedCountry)) {
      throw new BadRequestException('countryId must be a number');
    }
    if (refresh !== 'true') {
      const cached = await this.persistence.findLeaguesByCountry(parsedCountry);
      if (cached.length) return cached;
    }
    const leagues = await this.apiFootballClient.fetchLeagues(parsedCountry);
    if (leagues.length) await this.persistence.persistLeagues(leagues);
    return this.persistence.findLeaguesByCountry(parsedCountry);
  }

  /**
   * Teams — cache-first per league.
   * Served from DB unless `?refresh=true` or DB has no entries for this league.
   */
  @Get('teams')
  async getTeams(
    @Query('leagueId') leagueId?: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!leagueId) throw new BadRequestException('leagueId is required');
    const parsedLeague = Number(leagueId);
    if (Number.isNaN(parsedLeague)) throw new BadRequestException('leagueId must be a number');

    if (refresh !== 'true') {
      const cached = await this.persistence.findTeamsByLeague(parsedLeague);
      if (cached.length) return cached;
    }
    const teams = await this.apiFootballClient.fetchTeamsByLeague(parsedLeague);
    await this.persistence.persistTeams(parsedLeague, teams);
    return this.persistence.findTeamsByLeague(parsedLeague);
  }

  /**
   * Matches — always fresh from external API, then persisted.
   */
  @Get('matches')
  async getMatches(@Query('leagueId') leagueId?: string) {
    if (!leagueId) throw new BadRequestException('leagueId is required');
    const parsedLeague = Number(leagueId);
    if (Number.isNaN(parsedLeague)) throw new BadRequestException('leagueId must be a number');
    const matches = await this.apiFootballClient.fetchLeagueFixtures(parsedLeague);
    if (matches.length) await this.persistence.persistMatches(parsedLeague, matches);
    return matches;
  }

  /**
   * Standings — fetches from external API, persists, returns from DB.
   */
  @Get('standings')
  async getStandings(@Query('leagueId') leagueId?: string) {
    if (!leagueId) throw new BadRequestException('leagueId is required');
    const parsedLeague = Number(leagueId);
    if (Number.isNaN(parsedLeague)) throw new BadRequestException('leagueId must be a number');
    const data = await this.apiFootballClient.fetchStandings(parsedLeague);
    if (data.length) await this.persistence.persistStandings(parsedLeague, data);
    return this.persistence.getStandings(parsedLeague);
  }
}

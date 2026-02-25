import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../database/entities/country.entity';
import { League } from '../database/entities/league.entity';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { Match } from '../database/entities/match.entity';
import { Team } from '../database/entities/team.entity';
import { IsNull, Not } from 'typeorm';

type ProviderTeamPayload = {
  team_key: number;
  team_name: string;
  country?: string;
  team_logo?: string;
};

@Injectable()
export class ProviderPersistenceService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(League)
    private readonly leagueRepository: Repository<League>,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
  ) {}

  async persistCountries(countries: Array<{ country_id: number; country_name: string; country_logo?: string }>) {
    const rows = countries.map((country) => ({
      countryId: country.country_id,
      name: country.country_name,
      logo: country.country_logo ?? null,
    }));
    await this.countryRepository.upsert(rows, ['countryId']);
  }

  async persistLeagues(leagues: Array<{ league_id: number; league_name: string; country_id?: number; season?: number }>) {
    const rows = leagues.map((league) => ({
      leagueId: league.league_id,
      name: league.league_name,
      countryId: league.country_id ?? null,
      season: league.season ?? null,
    }));
    await this.leagueRepository.upsert(rows, ['leagueId']);
  }

  async persistTeams(leagueId: number, teams: ProviderTeamPayload[]): Promise<void> {
    if (!leagueId || !teams.length) return;

    const rows = teams.map((payload) => ({
      teamKey: payload.team_key,
      name: payload.team_name,
      country: payload.country ?? null,
      badge: payload.team_logo ?? null,
      leagueId,
      raw: payload,
    }));

    await this.teamRepository.upsert(rows, ['teamKey']);
  }

  async persistMatches(
    leagueId: number,
    matches: Array<{
      fixture_id?: number;
      league_id?: number;
      league_name?: string;
      event_date?: string;
      match_hometeam_name?: string;
      match_awayteam_name?: string;
      match_status?: string;
      match_round?: string;
    }>,
  ): Promise<void> {
    if (!leagueId || !matches.length) return;

    const rows = matches
      .filter((match) => match.fixture_id)
      .map((match) => ({
        fixtureId: match.fixture_id!,
        leagueId: leagueId,
        leagueName: match.league_name ?? null,
        homeName: match.match_hometeam_name ?? null,
        awayName: match.match_awayteam_name ?? null,
        eventDate: match.event_date ? new Date(match.event_date) : null,
        status: match.match_status ?? null,
        round: match.match_round ?? null,
        raw: match,
      }));

    if (!rows.length) return;
    await this.matchRepository.upsert(rows, ['fixtureId']);
  }

  private async getLatestPayload(endpoint: string) {
    return this.payloadRepository.findOne({
      where: { endpoint },
      order: { fetchedAt: 'DESC' },
    });
  }

  async replayFromPayloads(): Promise<void> {
    const countriesPayload = await this.getLatestPayload('countries');
    if (countriesPayload && Array.isArray(countriesPayload.payload)) {
      await this.persistCountries(countriesPayload.payload as Array<{
        country_id: number;
        country_name: string;
        country_logo?: string;
      }>);
    }

    const leaguesPayload = await this.getLatestPayload('leagues');
    if (leaguesPayload && Array.isArray(leaguesPayload.payload)) {
      await this.persistLeagues(leaguesPayload.payload as Array<{
        league_id: number;
        league_name: string;
        country_id?: number;
        season?: number;
      }>);
    }

    const teamPayloads = await this.payloadRepository.find({
      where: {
        endpoint: 'teams',
        leagueId: Not(IsNull()),
      },
      order: { fetchedAt: 'DESC' },
    });
    const seenLeagues = new Set<number>();
    for (const entry of teamPayloads) {
      const leagueId = entry.leagueId;
      if (!leagueId || seenLeagues.has(leagueId)) {
        continue;
      }
      seenLeagues.add(leagueId);
      if (Array.isArray(entry.payload)) {
        await this.persistTeams(leagueId, entry.payload as ProviderTeamPayload[]);
      }
    }

    const matchPayloads = await this.payloadRepository.find({
      where: {
        endpoint: 'league_fixtures',
        leagueId: Not(IsNull()),
      },
      order: { fetchedAt: 'DESC' },
    });
    const seenMatchLeagues = new Set<number>();
    for (const entry of matchPayloads) {
      const leagueId = entry.leagueId;
      if (!leagueId || seenMatchLeagues.has(leagueId)) {
        continue;
      }
      seenMatchLeagues.add(leagueId);
      if (Array.isArray(entry.payload)) {
        await this.persistMatches(leagueId, entry.payload as Array<{
          fixture_id?: number;
          league_id?: number;
          league_name?: string;
          event_date?: string;
          match_hometeam_name?: string;
          match_awayteam_name?: string;
          match_status?: string;
          match_round?: string;
        }>);
      }
    }
  }
}

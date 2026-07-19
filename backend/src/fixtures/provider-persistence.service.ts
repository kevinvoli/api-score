import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../database/entities/country.entity';
import { League } from '../database/entities/league.entity';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { Match } from '../database/entities/match.entity';
import { Team } from '../database/entities/team.entity';
import { Standing } from '../database/entities/standing.entity';
import { IsNull, Not } from 'typeorm';

type ProviderTeamPayload = {
  team_key: number;
  team_name: string;
  country?: string;
  team_logo?: string;
};

type ProviderLeaguePayload = {
  league_id: number;
  league_name: string;
  country_id?: number;
  season?: string | number;
  league_logo?: string;
  country_name?: string;
};

type ProviderMatchPayload = {
  fixture_id?: number;
  match_id?: number;
  league_id?: number;
  league_name?: string;
  league_logo?: string;
  country_id?: string | number;
  country_name?: string;
  country_logo?: string;
  event_date?: string;
  match_date?: string;
  match_time?: string;
  match_hometeam_name?: string;
  match_awayteam_name?: string;
  match_hometeam_id?: string | number;
  match_awayteam_id?: string | number;
  team_home_badge?: string;
  team_away_badge?: string;
  team_home_formation?: string;
  team_away_formation?: string;
  match_hometeam_score?: string;
  match_awayteam_score?: string;
  match_hometeam_halftime_score?: string;
  match_awayteam_halftime_score?: string;
  match_hometeam_extra_score?: string;
  match_awayteam_extra_score?: string;
  match_hometeam_penalty_score?: string;
  match_awayteam_penalty_score?: string;
  match_hometeam_ft_score?: string;
  match_awayteam_ft_score?: string;
  match_status?: string;
  match_live?: string | number;
  match_round?: string;
  stage_id?: string;
  stage_name?: string;
  match_stadium?: string;
  match_referee?: string;
};

type ProviderStandingEntry = {
  country_name?: string;
  league_id?: string | number;
  league_name?: string;
  league_season?: string;
  standing?: Array<{
    standing_place?: string | number;
    standing_place_type?: string;
    standing_team?: string;
    standing_P?: string | number;
    standing_W?: string | number;
    standing_D?: string | number;
    standing_L?: string | number;
    standing_F?: string | number;
    standing_A?: string | number;
    standing_GD?: string | number;
    standing_PTS?: string | number;
    team_key?: string | number;
    team_badge?: string;
    home?: {
      standing_W?: string | number;
      standing_D?: string | number;
      standing_L?: string | number;
      standing_F?: string | number;
      standing_A?: string | number;
      standing_PTS?: string | number;
    };
    away?: {
      standing_W?: string | number;
      standing_D?: string | number;
      standing_L?: string | number;
      standing_F?: string | number;
      standing_A?: string | number;
      standing_PTS?: string | number;
    };
  }>;
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
    @InjectRepository(Standing)
    private readonly standingRepository: Repository<Standing>,
  ) {}

  async persistCountries(
    countries: Array<{
      country_id: number;
      country_name: string;
      country_logo?: string;
    }>,
  ) {
    const rows = countries.map((country) => ({
      countryId: country.country_id,
      name: country.country_name,
      logo: country.country_logo ?? null,
    }));
    await this.countryRepository.upsert(rows, ['countryId']);
  }

  async persistLeagues(leagues: ProviderLeaguePayload[]) {
    const rows = leagues.map((league) => ({
      leagueId: Number(league.league_id),
      name: league.league_name,
      countryId: league.country_id != null ? Number(league.country_id) : null,
      season: league.season != null ? String(league.season) : null,
      logo: league.league_logo ?? null,
      countryName: league.country_name ?? null,
    }));
    await this.leagueRepository.upsert(rows, ['leagueId']);
  }

  async persistTeams(
    leagueId: number,
    teams: ProviderTeamPayload[],
  ): Promise<void> {
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
    matches: ProviderMatchPayload[],
  ): Promise<void> {
    if (!leagueId || !matches.length) return;

    const toNum = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };
    const toStr = (v: unknown): string | null =>
      v != null && v !== '' ? String(v) : null;

    const rows = matches
      .filter((match) => match.fixture_id ?? match.match_id)
      .map((match) => ({
        fixtureId: (match.fixture_id ?? match.match_id)!,
        leagueId,
        leagueName: toStr(match.league_name),
        leagueLogo: toStr(match.league_logo),
        countryId: toNum(match.country_id),
        countryName: toStr(match.country_name),
        countryLogo: toStr(match.country_logo),
        homeTeamId: toNum(match.match_hometeam_id),
        homeName: toStr(match.match_hometeam_name),
        homeTeamBadge: toStr(match.team_home_badge),
        homeFormation: toStr(match.team_home_formation),
        awayTeamId: toNum(match.match_awayteam_id),
        awayName: toStr(match.match_awayteam_name),
        awayTeamBadge: toStr(match.team_away_badge),
        awayFormation: toStr(match.team_away_formation),
        matchDate: toStr(match.match_date),
        matchTime: toStr(match.match_time),
        eventDate: match.event_date ? new Date(match.event_date) : null,
        scoreHome: toStr(match.match_hometeam_score),
        scoreAway: toStr(match.match_awayteam_score),
        halfTimeScoreHome: toStr(match.match_hometeam_halftime_score),
        halfTimeScoreAway: toStr(match.match_awayteam_halftime_score),
        extraTimeScoreHome: toStr(match.match_hometeam_extra_score),
        extraTimeScoreAway: toStr(match.match_awayteam_extra_score),
        penaltyScoreHome: toStr(match.match_hometeam_penalty_score),
        penaltyScoreAway: toStr(match.match_awayteam_penalty_score),
        ftScoreHome: toStr(match.match_hometeam_ft_score),
        ftScoreAway: toStr(match.match_awayteam_ft_score),
        status: toStr(match.match_status),
        isLive: match.match_live == 1 || match.match_live === '1' ? 1 : 0,
        round: toStr(match.match_round),
        stageId: toStr(match.stage_id),
        stageName: toStr(match.stage_name),
        stadium: toStr(match.match_stadium),
        referee: toStr(match.match_referee),
        raw: match as Record<string, unknown>,
      }));

    if (!rows.length) return;
    await this.matchRepository.upsert(rows, ['fixtureId']);
  }

  async persistStandings(
    leagueId: number,
    entries: ProviderStandingEntry[],
  ): Promise<void> {
    if (!leagueId || !entries.length) return;

    const toNum = (v: unknown): number => {
      if (v == null || v === '') return 0;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    };
    const toNumOrNull = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const rows: Array<Omit<Standing, 'id' | 'createdAt' | 'updatedAt'>> = [];

    for (const entry of entries) {
      const season = entry.league_season ?? null;
      const standings = entry.standing ?? [];

      for (const s of standings) {
        rows.push({
          leagueId,
          season,
          teamKey: toNum(s.team_key),
          teamName: s.standing_team ?? '',
          teamBadge: s.team_badge ?? null,
          standingPlace: toNum(s.standing_place),
          standingPlaceType: s.standing_place_type ?? null,
          played: toNum(s.standing_P),
          won: toNum(s.standing_W),
          drawn: toNum(s.standing_D),
          lost: toNum(s.standing_L),
          goalsFor: toNum(s.standing_F),
          goalsAgainst: toNum(s.standing_A),
          goalDiff: toNum(s.standing_GD),
          points: toNum(s.standing_PTS),
          homeWon: toNumOrNull(s.home?.standing_W),
          homeDrawn: toNumOrNull(s.home?.standing_D),
          homeLost: toNumOrNull(s.home?.standing_L),
          homeGF: toNumOrNull(s.home?.standing_F),
          homeGA: toNumOrNull(s.home?.standing_A),
          homePoints: toNumOrNull(s.home?.standing_PTS),
          awayWon: toNumOrNull(s.away?.standing_W),
          awayDrawn: toNumOrNull(s.away?.standing_D),
          awayLost: toNumOrNull(s.away?.standing_L),
          awayGF: toNumOrNull(s.away?.standing_F),
          awayGA: toNumOrNull(s.away?.standing_A),
          awayPoints: toNumOrNull(s.away?.standing_PTS),
        });
      }
    }

    if (!rows.length) return;
    await this.standingRepository.upsert(rows, ['leagueId', 'teamKey']);
  }

  async getStandings(leagueId: number): Promise<Standing[]> {
    return this.standingRepository.find({
      where: { leagueId },
      order: { standingPlace: 'ASC' },
    });
  }

  // ── Cache-read helpers (DB → API format) ─────────────────────

  async findAllCountries(): Promise<
    Array<{ country_id: number; country_name: string; country_logo?: string }>
  > {
    const rows = await this.countryRepository.find({ order: { name: 'ASC' } });
    return rows.map((c) => ({
      country_id: c.countryId,
      country_name: c.name,
      ...(c.logo ? { country_logo: c.logo } : {}),
    }));
  }

  async findLeaguesByCountry(
    countryId?: number,
  ): Promise<ProviderLeaguePayload[]> {
    const where = countryId != null ? { countryId } : {};
    const rows = await this.leagueRepository.find({
      where,
      order: { name: 'ASC' },
    });
    return rows.map((l) => ({
      league_id: l.leagueId,
      league_name: l.name,
      ...(l.countryId != null ? { country_id: l.countryId } : {}),
      ...(l.season ? { season: l.season } : {}),
      ...(l.logo ? { league_logo: l.logo } : {}),
      ...(l.countryName ? { country_name: l.countryName } : {}),
    }));
  }

  async findTeamsByLeague(leagueId: number): Promise<ProviderTeamPayload[]> {
    const rows = await this.teamRepository.find({
      where: { leagueId },
      order: { name: 'ASC' },
    });
    return rows.map((t) => ({
      team_key: t.teamKey,
      team_name: t.name,
      ...(t.country ? { country: t.country } : {}),
      ...(t.badge ? { team_logo: t.badge } : {}),
    }));
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
      await this.persistCountries(
        countriesPayload.payload as Array<{
          country_id: number;
          country_name: string;
          country_logo?: string;
        }>,
      );
    }

    const leaguesPayload = await this.getLatestPayload('leagues');
    if (leaguesPayload && Array.isArray(leaguesPayload.payload)) {
      await this.persistLeagues(
        leaguesPayload.payload as ProviderLeaguePayload[],
      );
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
      const lid = entry.leagueId;
      if (!lid || seenLeagues.has(lid)) continue;
      seenLeagues.add(lid);
      if (Array.isArray(entry.payload)) {
        await this.persistTeams(lid, entry.payload as ProviderTeamPayload[]);
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
      const lid = entry.leagueId;
      if (!lid || seenMatchLeagues.has(lid)) continue;
      seenMatchLeagues.add(lid);
      if (Array.isArray(entry.payload)) {
        await this.persistMatches(lid, entry.payload as ProviderMatchPayload[]);
      }
    }
  }
}

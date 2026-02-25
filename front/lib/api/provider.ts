import { apiFetch } from './client';

export type ProviderCountry = {
  country_id: number;
  country_name: string;
  country_logo?: string;
};

export type ProviderLeague = {
  league_id: number;
  league_name: string;
  country_id?: number;
  season?: string;
  league_logo?: string;
  country_name?: string;
};

export type ProviderTeam = {
  team_key: number;
  team_name: string;
  country?: string;
  team_logo?: string;
};

export type ProviderMatch = {
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

export type ProviderStanding = {
  id: string;
  leagueId: number;
  season: string | null;
  teamKey: number;
  teamName: string;
  teamBadge: string | null;
  standingPlace: number;
  standingPlaceType: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  homeWon: number | null;
  homeDrawn: number | null;
  homeLost: number | null;
  homeGF: number | null;
  homeGA: number | null;
  homePoints: number | null;
  awayWon: number | null;
  awayDrawn: number | null;
  awayLost: number | null;
  awayGF: number | null;
  awayGA: number | null;
  awayPoints: number | null;
};

export const fetchProviderCountries = async (refresh?: boolean): Promise<ProviderCountry[]> =>
  apiFetch<ProviderCountry[]>('/v1/provider/countries', {
    query: refresh ? { refresh: 'true' } : undefined,
  });

export const fetchProviderLeagues = async (countryId?: number, refresh?: boolean): Promise<ProviderLeague[]> =>
  apiFetch<ProviderLeague[]>('/v1/provider/leagues', {
    query: { ...(countryId != null ? { countryId } : {}), ...(refresh ? { refresh: 'true' } : {}) },
  });

export const fetchProviderTeams = async (leagueId: number, refresh?: boolean): Promise<ProviderTeam[]> =>
  apiFetch<ProviderTeam[]>('/v1/provider/teams', {
    query: { leagueId, ...(refresh ? { refresh: 'true' } : {}) },
  });

export const fetchProviderMatches = async (leagueId: number): Promise<ProviderMatch[]> =>
  apiFetch<ProviderMatch[]>('/v1/provider/matches', {
    query: { leagueId },
  });

export const fetchProviderStandings = async (leagueId: number): Promise<ProviderStanding[]> =>
  apiFetch<ProviderStanding[]>('/v1/provider/standings', {
    query: { leagueId },
  });

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
  season?: number;
};

export type ProviderTeam = {
  team_key: number;
  team_name: string;
  country?: string;
  team_logo?: string;
};

export const fetchProviderCountries = async (): Promise<ProviderCountry[]> => {
  return apiFetch<ProviderCountry[]>('/v1/provider/countries');
};

export const fetchProviderLeagues = async (countryId?: number): Promise<ProviderLeague[]> => {
  return apiFetch<ProviderLeague[]>('/v1/provider/leagues', {
    query: countryId ? { countryId } : undefined,
  });
};

export const fetchProviderTeams = async (leagueId: number): Promise<ProviderTeam[]> => {
  return apiFetch<ProviderTeam[]>('/v1/provider/teams', {
    query: { leagueId },
  });
};

export type ProviderMatch = {
  fixture_id?: number;
  league_id?: number;
  league_name?: string;
  event_date?: string;
  match_hometeam_name?: string;
  match_awayteam_name?: string;
  match_status?: string;
  match_round?: string;
};

export const fetchProviderMatches = async (leagueId: number): Promise<ProviderMatch[]> =>
  apiFetch<ProviderMatch[]>('/v1/provider/matches', {
    query: { leagueId },
  });

import { useQuery } from '@tanstack/react-query';
import {
  fetchProviderCountries,
  fetchProviderLeagues,
  fetchProviderTeams,
  fetchProviderMatches,
} from '../api/provider';

export const useProviderCountries = () =>
  useQuery({
    queryKey: ['provider', 'countries'],
    queryFn: fetchProviderCountries,
    staleTime: 1000 * 60 * 5,
  });

export const useProviderLeagues = (countryId?: number) =>
  useQuery({
    queryKey: ['provider', 'leagues', countryId ?? 'all'],
    queryFn: () => fetchProviderLeagues(countryId),
    staleTime: 1000 * 60 * 5,
  });

export const useProviderTeams = (leagueId?: number) =>
  useQuery({
    queryKey: ['provider', 'teams', leagueId ?? 'none'],
    queryFn: () => (leagueId ? fetchProviderTeams(leagueId) : Promise.resolve([])),
    enabled: Boolean(leagueId),
    staleTime: 1000 * 60 * 5,
  });

export const useProviderMatches = (leagueId?: number) =>
  useQuery({
    queryKey: ['provider', 'matches', leagueId ?? 'none'],
    queryFn: () => (leagueId ? fetchProviderMatches(leagueId) : Promise.resolve([])),
    enabled: Boolean(leagueId),
    staleTime: 1000 * 60 * 3,
  });

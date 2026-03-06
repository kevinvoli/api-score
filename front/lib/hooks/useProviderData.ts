import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  fetchProviderCountries,
  fetchProviderLeagues,
  fetchProviderTeams,
  fetchProviderMatches,
  fetchProviderStandings,
} from '../api/provider';

export const useProviderCountries = () =>
  useQuery({
    queryKey: ['provider', 'countries'],
    queryFn: () => fetchProviderCountries(),
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

export const useProviderMatches = (leagueId?: number, from?: string, to?: string) =>
  useQuery({
    queryKey: ['provider', 'matches', leagueId ?? 'none', from, to],
    queryFn: () => (leagueId ? fetchProviderMatches(leagueId, from, to) : Promise.resolve([])),
    enabled: Boolean(leagueId),
    staleTime: 1000 * 60 * 5,
  });

export const useProviderStandings = (leagueId?: number) =>
  useQuery({
    queryKey: ['provider', 'standings', leagueId ?? 'none'],
    queryFn: () => (leagueId ? fetchProviderStandings(leagueId) : Promise.resolve([])),
    enabled: Boolean(leagueId),
    staleTime: 1000 * 60 * 5,
  });

/**
 * Provides sync functions that force re-fetch from the external API
 * (bypassing the DB cache) and then invalidate React Query cache.
 */
export function useSyncProvider(options?: { countryId?: number; leagueId?: number }) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await fetchProviderCountries(true);
      await queryClient.invalidateQueries({ queryKey: ['provider', 'countries'] });

      if (options?.countryId != null) {
        await fetchProviderLeagues(options.countryId, true);
        await queryClient.invalidateQueries({ queryKey: ['provider', 'leagues'] });
      }

      if (options?.leagueId != null) {
        await fetchProviderTeams(options.leagueId, true);
        await queryClient.invalidateQueries({ queryKey: ['provider', 'teams'] });
        // Invalider ET forcer le refetch des matchs pour ce championnat
        await queryClient.invalidateQueries({ queryKey: ['provider', 'matches', options.leagueId] });
        await queryClient.refetchQueries({ queryKey: ['provider', 'matches', options.leagueId] });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient, options?.countryId, options?.leagueId]);

  return { sync, isSyncing };
}

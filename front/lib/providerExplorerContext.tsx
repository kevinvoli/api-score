'use client';

import { ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { useProviderCountries, useProviderLeagues, useProviderTeams } from './hooks/useProviderData';

type ProviderExplorerValue = {
  countries: Array<{ country_id: number; country_name: string; country_logo?: string }>;
  leagues: Array<{ league_id: number; league_name: string; country_id?: number; season?: string; league_logo?: string; country_name?: string }>;
  teams: Array<{ team_key: number; team_name: string; country?: string; team_logo?: string }>;
  selectedCountryId: number | null;
  selectedLeagueId: number | null;
  setSelectedCountryId: (value: number | null) => void;
  setSelectedLeagueId: (value: number | null) => void;
  countriesLoading: boolean;
  leaguesLoading: boolean;
  teamsLoading: boolean;
};

const ProviderExplorerContext = createContext<ProviderExplorerValue | null>(null);

export function ProviderExplorerProvider({ children }: { children: ReactNode }) {
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);

  const countriesQuery = useProviderCountries();
  const leaguesQuery = useProviderLeagues(selectedCountryId ?? undefined);
  const teamsQuery = useProviderTeams(selectedLeagueId ?? undefined);

  const value = useMemo<ProviderExplorerValue>(
    () => ({
      countries: countriesQuery.data ?? [],
      leagues: leaguesQuery.data ?? [],
      teams: teamsQuery.data ?? [],
      selectedCountryId,
      selectedLeagueId,
      setSelectedCountryId: (value) => {
        setSelectedCountryId(value);
        if (value === null) {
          setSelectedLeagueId(null);
        }
      },
      setSelectedLeagueId,
      countriesLoading: countriesQuery.isLoading,
      leaguesLoading: leaguesQuery.isLoading,
      teamsLoading: teamsQuery.isLoading,
    }),
    [
      countriesQuery.data,
      leaguesQuery.data,
      teamsQuery.data,
      selectedCountryId,
      selectedLeagueId,
      countriesQuery.isLoading,
      leaguesQuery.isLoading,
      teamsQuery.isLoading,
    ],
  );

  return <ProviderExplorerContext.Provider value={value}>{children}</ProviderExplorerContext.Provider>;
}

export const useProviderExplorer = (): ProviderExplorerValue => {
  const context = useContext(ProviderExplorerContext);
  if (!context) {
    throw new Error('useProviderExplorer must be used within ProviderExplorerProvider');
  }
  return context;
};

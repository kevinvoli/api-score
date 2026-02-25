import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type LiveFilters = {
  leagueId?: number;
  statusShort?: string;
  confidenceMin?: number;
  sortBy?: 'lastSyncedAt' | 'matchDate' | 'elapsed';
  sortOrder?: 'ASC' | 'DESC';
};

export const REFRESH_INTERVAL_OPTIONS = [
  { label: '15 s',   value: 15_000 },
  { label: '30 s',   value: 30_000 },
  { label: '1 min',  value: 60_000 },
  { label: '2 min',  value: 120_000 },
  { label: '5 min',  value: 300_000 },
  { label: 'Manuel', value: 0 },
] as const;

type UiControlsState = {
  filters: LiveFilters;
  setFilters: (updates: Partial<LiveFilters>) => void;
  resetFilters: () => void;
  activeFixtureId: string | null;
  setActiveFixture: (fixtureId: string | null) => void;
  liveRefreshIntervalMs: number;
  setLiveRefreshInterval: (ms: number) => void;
};

export const useUiControlsStore = create<UiControlsState>()(
  persist(
    (set) => ({
      filters: {
        sortBy: 'lastSyncedAt',
        sortOrder: 'DESC',
      },
      setFilters: (updates) =>
        set((state) => ({ filters: { ...state.filters, ...updates } })),
      resetFilters: () =>
        set({ filters: { sortBy: 'lastSyncedAt', sortOrder: 'DESC' } }),
      activeFixtureId: null,
      setActiveFixture: (fixtureId) => set({ activeFixtureId: fixtureId }),
      liveRefreshIntervalMs: 30_000,
      setLiveRefreshInterval: (ms) => set({ liveRefreshIntervalMs: ms }),
    }),
    {
      name: 'ui-controls',
      storage: createJSONStorage(() => localStorage),
      // Only persist the refresh interval setting — transient UI state stays ephemeral
      partialize: (state) => ({ liveRefreshIntervalMs: state.liveRefreshIntervalMs }),
    },
  ),
);

import { create } from 'zustand';

type LiveFilters = {
  leagueId?: number;
  statusShort?: string;
  confidenceMin?: number;
  sortBy?: 'lastSyncedAt' | 'matchDate' | 'elapsed';
  sortOrder?: 'ASC' | 'DESC';
};

type UiControlsState = {
  filters: LiveFilters;
  setFilters: (updates: Partial<LiveFilters>) => void;
  resetFilters: () => void;
  activeFixtureId: string | null;
  setActiveFixture: (fixtureId: string | null) => void;
};

export const useUiControlsStore = create<UiControlsState>((set) => ({
  filters: {
    sortBy: 'lastSyncedAt',
    sortOrder: 'DESC'
  },
  setFilters: (updates) =>
    set((state) => ({
      filters: { ...state.filters, ...updates }
    })),
  resetFilters: () =>
    set({
      filters: {
        sortBy: 'lastSyncedAt',
        sortOrder: 'DESC'
      }
    }),
  activeFixtureId: null,
  setActiveFixture: (fixtureId) => set({ activeFixtureId: fixtureId })
}));

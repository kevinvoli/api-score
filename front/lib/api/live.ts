import type { LiveFixture } from '../types/live';
import { apiFetch } from './client';

export const fetchLiveFixtures = async (params?: {
  leagueId?: number;
  statusShort?: string;
  minElapsed?: number;
  maxElapsed?: number;
  teamId?: number;
  page?: number;
  limit?: number;
  sortBy?: 'lastSyncedAt' | 'matchDate' | 'elapsed';
  sortOrder?: 'ASC' | 'DESC';
}): Promise<{ items: LiveFixture[]; page: number; limit: number; total: number }> => {
  return apiFetch('/v1/live/fixtures', { query: params });
};

export const fetchFixtureSummary = async (fixtureId: string) => {
  return apiFetch(`/v1/live/fixtures/${fixtureId}/summary`);
};

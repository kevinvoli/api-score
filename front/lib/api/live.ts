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
  return apiFetch<{ items: LiveFixture[]; page: number; limit: number; total: number }>('/v1/live/fixtures', {
    query: params
  });
};

export const fetchFixtureSummary = async (fixtureId: string) => {
  return apiFetch<import('../types/fixture-detail').FixtureSummary>(
    `/v1/live/fixtures/${fixtureId}/summary`,
  );
};

export const fetchFixtureDetail = async (fixtureId: string) => {
  return apiFetch<import('../types/fixture-detail').FixtureDetail>(
    `/v1/live/fixtures/${fixtureId}/detail`,
  );
};

export type SyncResult = {
  fixturesSynced: number;
  eventsSynced: number;
  statsSynced: number;
  lineupsSynced: number;
  playerStatsSynced: number;
};

export const syncLiveFixtures = (): Promise<SyncResult> =>
  apiFetch<SyncResult>('/v1/live/fixtures/sync', { method: 'POST' });

export type SmartCoupon = {
  id: string;
  fixtureId: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  teamId: number | null;
  teamName: string | null;
  isHomeTeam: boolean;
  marketType: string;
  selection: string;
  currentOdd: number | null;
  minAcceptableOdd: number | null;
  edgePct: number | null;
  confidenceScore: number | null;
  baseRateSampleSize: number | null;
  reasons: string[] | null;
  ruleName: string | null;
  elapsedAtSuggestion: number | null;
  shotsCount: number | null;
  status: 'PENDING' | 'WON' | 'LOST';
  resolvedAt: string | null;
  createdAt: string;
};

export const fetchCouponHistory = (limit = 50, offset = 0): Promise<{ data: SmartCoupon[]; total: number }> =>
  apiFetch<{ data: SmartCoupon[]; total: number }>(
    `/v1/live/recommendations/coupons?limit=${limit}&offset=${offset}`,
  );

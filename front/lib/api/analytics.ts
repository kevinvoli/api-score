import { apiFetch } from './client';

export type FixtureAnalytics = {
  id: string;
  fixtureId: string;
  metrics: Record<string, any>;
  computedAt: string;
};

export const fetchFixtureAnalytics = async (fixtureId: string) => {
  return apiFetch<FixtureAnalytics | null>(`/v1/analytics/fixtures/${fixtureId}`);
};

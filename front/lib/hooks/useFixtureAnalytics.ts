import { useQuery } from '@tanstack/react-query';
import { fetchFixtureAnalytics } from '../api/analytics';

type FixtureAnalyticsResponse = Awaited<ReturnType<typeof fetchFixtureAnalytics>>;

export const useFixtureAnalytics = (fixtureId: string | undefined) =>
  useQuery<FixtureAnalyticsResponse>({
    queryKey: ['fixture-analytics', fixtureId],
    queryFn: () => fetchFixtureAnalytics(fixtureId ?? ''),
    enabled: Boolean(fixtureId),
    staleTime: 15000,
    cacheTime: 1000 * 60
  });

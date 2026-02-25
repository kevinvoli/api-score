import { useQuery } from '@tanstack/react-query';
import { fetchLiveFixtures } from '../api/live';

type LiveFixturesResponse = Awaited<ReturnType<typeof fetchLiveFixtures>>;

const REFETCH_INTERVAL_MS = 30_000;

export const useLiveFixtures = (params?: Parameters<typeof fetchLiveFixtures>[0]) =>
  useQuery<LiveFixturesResponse>({
    queryKey: ['live-fixtures', params],
    queryFn: () => fetchLiveFixtures(params),
    staleTime: 5000,
    gcTime: 1000 * 60,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

export { REFETCH_INTERVAL_MS as LIVE_FIXTURES_REFETCH_INTERVAL_MS };

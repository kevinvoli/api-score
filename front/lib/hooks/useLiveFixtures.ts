import { useQuery } from '@tanstack/react-query';
import { fetchLiveFixtures } from '../api/live';

type LiveFixturesResponse = Awaited<ReturnType<typeof fetchLiveFixtures>>;

export const useLiveFixtures = (params?: Parameters<typeof fetchLiveFixtures>[0]) =>
  useQuery<LiveFixturesResponse>({
    queryKey: ['live-fixtures', params],
    queryFn: () => fetchLiveFixtures(params),
    staleTime: 5000,
    cacheTime: 1000 * 60
  });

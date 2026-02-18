import { useQuery } from '@tanstack/react-query';
import { fetchLiveFixtures } from '../api/live';

export const useLiveFixtures = (params?: Parameters<typeof fetchLiveFixtures>[0]) =>
  useQuery({
    queryKey: ['live-fixtures', params],
    queryFn: () => fetchLiveFixtures(params),
    staleTime: 5000,
    cacheTime: 1000 * 60
  });

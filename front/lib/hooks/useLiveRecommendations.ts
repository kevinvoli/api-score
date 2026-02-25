import { useQuery } from '@tanstack/react-query';
import { fetchLiveRecommendations } from '../api/recommendations';

type LiveRecommendationsResponse = Awaited<ReturnType<typeof fetchLiveRecommendations>>;

export const useLiveRecommendations = (
  params?: Parameters<typeof fetchLiveRecommendations>[0]
) =>
  useQuery<LiveRecommendationsResponse>({
    queryKey: ['live-recommendations', params],
    queryFn: () => fetchLiveRecommendations(params),
    staleTime: 15000,
    gcTime: 1000 * 60
  });

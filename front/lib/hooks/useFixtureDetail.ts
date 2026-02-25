import { useQuery } from '@tanstack/react-query';
import { fetchFixtureDetail, fetchFixtureSummary } from '../api/live';

export const useFixtureDetail = (fixtureId: string | null) => {
  const enabled = Boolean(fixtureId);

  const detail = useQuery({
    queryKey: ['fixture-detail', fixtureId],
    queryFn: () => fetchFixtureDetail(fixtureId!),
    enabled,
    staleTime: 10_000,
    gcTime: 1000 * 60,
  });

  const summary = useQuery({
    queryKey: ['fixture-summary', fixtureId],
    queryFn: () => fetchFixtureSummary(fixtureId!),
    enabled,
    staleTime: 10_000,
    gcTime: 1000 * 60,
  });

  return { detail, summary, isLoading: detail.isLoading || summary.isLoading };
};

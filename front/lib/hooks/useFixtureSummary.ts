import { useQuery } from '@tanstack/react-query';
import { fetchFixtureSummary } from '../api/live';

export const useFixtureSummary = (fixtureId: string | undefined) =>
  useQuery({
    queryKey: ['fixture-summary', fixtureId],
    queryFn: () => fetchFixtureSummary(fixtureId ?? ''),
    enabled: Boolean(fixtureId),
    staleTime: 10000
  });

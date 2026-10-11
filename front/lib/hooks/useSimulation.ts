import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSimulationDecisions,
  fetchSimulationRuns,
  fetchSimulationSummary,
  stopSimulationRun,
} from '../api/simulation';
import { singleFlight } from '../api/execution';
import type { DecisionStatus } from '../types/simulation';

export const SIMULATION_RUNS_KEY = ['simulation-runs'] as const;

export const useSimulationRuns = () =>
  useQuery({ queryKey: SIMULATION_RUNS_KEY, queryFn: fetchSimulationRuns, refetchInterval: 30_000 });

export const useSimulationSummary = (id: string | null) =>
  useQuery({
    queryKey: ['simulation-summary', id],
    queryFn: () => fetchSimulationSummary(id as string),
    enabled: id !== null,
    refetchInterval: 30_000,
  });

export const useSimulationDecisions = (id: string | null, status: DecisionStatus | null) =>
  useInfiniteQuery({
    queryKey: ['simulation-decisions', id, status],
    queryFn: ({ pageParam }) =>
      fetchSimulationDecisions(id as string, {
        status: status ?? undefined,
        cursor: pageParam ?? undefined,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: id !== null,
  });

export const useStopSimulationRun = () => {
  const queryClient = useQueryClient();
  const send = useMemo(() => singleFlight((id: string) => stopSimulationRun(id)), []);
  return useMutation({
    mutationFn: send,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SIMULATION_RUNS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['simulation-summary'] });
    },
  });
};

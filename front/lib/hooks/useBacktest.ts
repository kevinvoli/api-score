import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBacktestRun,
  fetchBacktestRuns,
  runBaselineBacktest,
} from '../api/audit';

export const useBacktestRuns = () =>
  useQuery({
    queryKey: ['backtest-runs'],
    queryFn: fetchBacktestRuns,
    staleTime: 30_000,
  });

export const useBacktestRun = (id: string | null) =>
  useQuery({
    queryKey: ['backtest-run', id],
    queryFn: () => fetchBacktestRun(id as string),
    enabled: id !== null,
    staleTime: 60_000,
  });

export const useRunBaselineBacktest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runBaselineBacktest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backtest-runs'] });
    },
  });
};

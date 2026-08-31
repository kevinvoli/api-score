import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBacktestRun,
  fetchBacktestRuns,
  runBaselineBacktest,
  testBacktestConfig,
} from '../api/audit';
import type { SmartRulesConfig } from '../api/smartRules';

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

/**
 * LOT A.5 : rejoue l'historique avec une config de règles fournie explicitement
 * (typiquement non sauvegardée), pour la page Paramètres. Le run reste visible
 * dans l'historique Audit comme n'importe quel backtest.
 */
export const useTestBacktestConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryRules: SmartRulesConfig) => testBacktestConfig(entryRules),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backtest-runs'] });
    },
  });
};

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildReconciliationRequest,
  changeExecutionMode,
  fetchExecutionAccounts,
  fetchExecutionControl,
  fetchExecutionOrders,
  fetchReconciliation,
  singleFlight,
  startReconciliation,
  stopExecution,
} from '../api/execution';
import type { ChangeModeRequest, OrderStatus, StopExecutionRequest } from '../types/execution';

export const EXECUTION_CONTROL_KEY = ['execution-control'] as const;
export const EXECUTION_ACCOUNTS_KEY = ['execution-accounts'] as const;
export const EXECUTION_ORDERS_KEY = ['execution-orders'] as const;

/** Contrôle relu souvent : un arrêt automatique doit apparaître sans recharger la page. */
export const useExecutionControl = () =>
  useQuery({
    queryKey: EXECUTION_CONTROL_KEY,
    queryFn: fetchExecutionControl,
    refetchInterval: 10_000,
    retry: 1,
  });

export const useExecutionAccounts = () =>
  useQuery({
    queryKey: EXECUTION_ACCOUNTS_KEY,
    queryFn: fetchExecutionAccounts,
    refetchInterval: 15_000,
  });

export const useExecutionOrders = (status: OrderStatus | null) =>
  useInfiniteQuery({
    queryKey: [...EXECUTION_ORDERS_KEY, status],
    queryFn: ({ pageParam }) =>
      fetchExecutionOrders({
        status: status ?? undefined,
        cursor: pageParam ?? undefined,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 15_000,
  });

export const useReconciliationRun = (id: string | null) =>
  useQuery({
    queryKey: ['execution-reconciliation', id],
    queryFn: () => fetchReconciliation(id as string),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? 2_000 : false),
  });

/**
 * Après toute mutation, succès ou échec (409 compris), l'état est relu depuis le backend :
 * l'écran n'affiche jamais une transition qui n'a pas été persistée.
 */
const useRefreshExecution = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: EXECUTION_CONTROL_KEY });
    void queryClient.invalidateQueries({ queryKey: EXECUTION_ACCOUNTS_KEY });
    void queryClient.invalidateQueries({ queryKey: EXECUTION_ORDERS_KEY });
  };
};

export const useStopExecution = () => {
  const refresh = useRefreshExecution();
  const send = useMemo(() => singleFlight((body: StopExecutionRequest) => stopExecution(body)), []);
  return useMutation({ mutationFn: send, onSettled: refresh });
};

export const useChangeExecutionMode = () => {
  const refresh = useRefreshExecution();
  const send = useMemo(() => singleFlight((body: ChangeModeRequest) => changeExecutionMode(body)), []);
  return useMutation({ mutationFn: send, onSettled: refresh });
};

export const useStartReconciliation = () => {
  const refresh = useRefreshExecution();
  const send = useMemo(
    () => singleFlight((accountId: string) => startReconciliation(buildReconciliationRequest(accountId))),
    [],
  );
  return useMutation({ mutationFn: send, onSettled: refresh });
};

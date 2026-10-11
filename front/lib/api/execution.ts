import { ApiError, apiFetch } from './client';
import type {
  AccountView,
  ChangeModeRequest,
  ControlSnapshot,
  ControlView,
  OrdersPage,
  OrdersQuery,
  ReconciliationRun,
  StartReconciliationRequest,
  StopExecutionRequest,
} from '../types/execution';

export const fetchExecutionControl = () => apiFetch<ControlView>('/v1/execution/control');

export const stopExecution = (body: StopExecutionRequest) =>
  apiFetch<ControlSnapshot>('/v1/execution/control/stop', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const changeExecutionMode = (body: ChangeModeRequest) =>
  apiFetch<ControlSnapshot>('/v1/execution/control/mode', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const fetchExecutionAccounts = () => apiFetch<AccountView[]>('/v1/execution/accounts');

export const fetchExecutionOrders = (query: OrdersQuery = {}) =>
  apiFetch<OrdersPage>('/v1/execution/orders', { query: { ...query } });

export const startReconciliation = (body: StartReconciliationRequest) =>
  apiFetch<{ runId: string }>('/v1/execution/reconciliations', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const fetchReconciliation = (id: string) =>
  apiFetch<ReconciliationRun>(`/v1/execution/reconciliations/${encodeURIComponent(id)}`);

const RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Requête de réconciliation des dernières 24 h. La clé est stable pendant une minute pour un
 * compte : un double clic ou une seconde console ouverte retrouvent le même run côté backend.
 */
export const buildReconciliationRequest = (
  accountId: string,
  now: Date = new Date(),
): StartReconciliationRequest => {
  const minute = Math.floor(now.getTime() / 60_000);
  return {
    accountId,
    from: new Date(now.getTime() - RECONCILIATION_WINDOW_MS).toISOString(),
    to: now.toISOString(),
    idempotencyKey: `console:${accountId}:${minute}`,
  };
};

/**
 * Partage l'appel en cours : tant qu'une exécution n'est pas terminée, tout nouvel appel reçoit la
 * même promesse au lieu de déclencher une seconde requête (double clic).
 */
export function singleFlight<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  let inFlight: Promise<R> | null = null;
  return (...args: A): Promise<R> => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

/** Message affichable d'une mutation refusée ; 409 = l'état a changé entre lecture et action. */
export const describeMutationError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return `Conflit de version : l'état a changé depuis l'affichage. Il a été rechargé, vérifiez-le avant de recommencer.${
        error.serverMessage ? ` (${error.serverMessage})` : ''
      }`;
    }
    if (error.status === 403) {
      return error.serverMessage ?? 'Action refusée pour votre rôle.';
    }
    if (error.status >= 500) {
      return 'Backend indisponible : aucune action n’a été confirmée.';
    }
    return error.serverMessage ?? `Requête refusée (${error.status}).`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Erreur inconnue';
};

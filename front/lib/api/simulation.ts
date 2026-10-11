import { apiFetch } from './client';
import type {
  DecisionsPage,
  DecisionsQuery,
  SimulationRunListItem,
  SimulationSummary,
} from '../types/simulation';

const runPath = (id: string) => `/v1/simulation/runs/${encodeURIComponent(id)}`;

export const fetchSimulationRuns = () => apiFetch<SimulationRunListItem[]>('/v1/simulation/runs');

export const fetchSimulationSummary = (id: string) =>
  apiFetch<SimulationSummary>(`${runPath(id)}/summary`);

export const fetchSimulationDecisions = (id: string, query: DecisionsQuery = {}) =>
  apiFetch<DecisionsPage>(`${runPath(id)}/decisions`, { query: { ...query } });

export const stopSimulationRun = (id: string) =>
  apiFetch<SimulationRunListItem>(`${runPath(id)}/stop`, { method: 'POST', body: '{}' });

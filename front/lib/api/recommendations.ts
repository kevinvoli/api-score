import type { Recommendation } from '../types/recommendation';
import { apiFetch } from './client';

export type LiveRecommendationsResponse =
  | { items: Recommendation[]; page?: number; limit?: number; total?: number }
  | Recommendation[];

export const fetchLiveRecommendations = async (params?: {
  fixtureId?: string;
  status?: 'NEW' | 'ACTIVE' | 'REJECTED';
  page?: number;
  limit?: number;
}): Promise<{ items: Recommendation[]; page?: number; limit?: number; total?: number }> => {
  const data = await apiFetch<LiveRecommendationsResponse>('/v1/live/recommendations', {
    query: params
  });

  if (Array.isArray(data)) {
    return { items: data };
  }

  return data;
};

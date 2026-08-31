import { apiFetch } from './client';

export type SmartSuggestion = {
  id: string;
  fixtureId: string;
  fixtureLabel: string;
  marketType: string;
  selection: string;
  currentOdd: number;
  minAcceptableOdd: number;
  edgePct: number;
  confidenceScore: number | null;
  baseRateSampleSize: number | null;
  reasons: string[];
  riskFlags: string[];
  status: 'NEW';
  ruleName: string;
  elapsed: number | null;
  shotsCount: number;
};

export const fetchSmartSuggestions = (): Promise<SmartSuggestion[]> =>
  apiFetch<SmartSuggestion[]>('/v1/live/recommendations/smart');

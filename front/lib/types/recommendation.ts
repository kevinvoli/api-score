export type Recommendation = {
  id: string;
  marketType: string;
  fixtureId: string;
  selection: string;
  currentOdd: number;
  minAcceptableOdd: number;
  edgePct: number;
  confidenceScore: number | null;
  baseRateSampleSize: number | null;
  reasons: string[];
  riskFlags: string[];
  status?: 'NEW' | 'ACTIVE' | 'REJECTED';
};

export type LiveFixture = {
  id: string;
  providerFixtureId: string;
  leagueId: number;
  season: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamBadge?: string | null;
  awayTeamBadge?: string | null;
  leagueName?: string | null;
  statusShort: string;
  statusLong: string;
  elapsed: number | null;
  matchDate: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  lastSyncedAt: string | null;
  /** Calculé par le backend : dernière sync > 120 s (match figé si statut live). */
  isStale?: boolean;
  raw?: Record<string, unknown>;
  confidence?: number;
};

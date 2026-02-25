export type FixtureEvent = {
  id: string;
  teamId: number | null;
  playerId: number | null;
  assistPlayerId: number | null;
  minute: number | null;
  extra: number | null;
  eventType: string | null;
  detail: string | null;
  raw: Record<string, unknown>;
};

export type FixtureStatsSnapshot = {
  id: string;
  teamId: number | null;
  half: string | null;
  elapsed: number | null;
  stats: Record<string, unknown>;
  snapshotAt: string;
};

export type FixtureLineup = {
  id: string;
  teamId: number | null;
  formation: string | null;
  coach: Record<string, unknown> | null;
  startXi: Record<string, unknown>[] | null;
  substitutes: Record<string, unknown>[] | null;
  snapshotAt: string;
};

export type FixtureDetail = {
  fixture: {
    id: string;
    providerFixtureId: string;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeTeamName: string | null;
    awayTeamName: string | null;
    homeTeamBadge: string | null;
    awayTeamBadge: string | null;
    leagueName: string | null;
    statusShort: string | null;
    statusLong: string | null;
    elapsed: number | null;
    scoreHome: number | null;
    scoreAway: number | null;
  };
  events: FixtureEvent[];
  latestStats: FixtureStatsSnapshot[];
  latestLineups: FixtureLineup[];
};

export type FixtureSummary = {
  fixture: {
    providerFixtureId: string;
    statusShort: string | null;
    elapsed: number | null;
    score: { home: number | null; away: number | null };
    teams: { homeTeamId: number | null; awayTeamId: number | null };
  };
  momentum: {
    homePressureIndex: number;
    awayPressureIndex: number;
    dominantSide: 'home' | 'away' | 'balanced';
  };
  recentEvents: Array<{
    minute: number | null;
    type: string | null;
    detail: string | null;
    teamId: number | null;
  }>;
  dataQuality: {
    hasRecentStats: boolean;
    hasLineups: boolean;
    hasPlayerStats: boolean;
    isStale: boolean;
    flags: string[];
  };
  confidence: number;
};

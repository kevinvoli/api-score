export const sampleLiveFixture = {
  id: 'fixture-123',
  providerFixtureId: '123',
  leagueId: 279,
  season: 2025,
  homeTeamId: 33,
  awayTeamId: 44,
  homeTeamName: 'Paris FC',
  awayTeamName: 'Lyon FC',
  statusShort: '2H',
  statusLong: 'Second Half',
  elapsed: 67,
  matchDate: '2026-02-18T17:00:00.000Z',
  scoreHome: 1,
  scoreAway: 2,
  lastSyncedAt: '2026-02-18T18:20:00.000Z',
  confidence: 82
};

export const sampleRecommendations = [
  {
    id: 'rec-1',
    marketType: 'Match Winner',
    fixtureId: 'fixture-123',
    selection: 'Paris FC (Home)',
    currentOdd: 2.15,
    minAcceptableOdd: 2.0,
    edgePct: 8.2,
    confidenceScore: 88,
    reasons: ['Momentum home 30% superieur', 'Attacks 42 vs 28', 'Price drift 8%'],
    riskFlags: []
  },
  {
    id: 'rec-2',
    marketType: 'Goals Over/Under',
    fixtureId: 'fixture-123',
    selection: 'Over 2.5 Goals',
    currentOdd: 1.85,
    minAcceptableOdd: 1.7,
    edgePct: 4.6,
    confidenceScore: 67,
    reasons: ['8 corners dans les 20 dernieres minutes', 'Shots on target x4'],
    riskFlags: ['Correlation forte']
  }
];

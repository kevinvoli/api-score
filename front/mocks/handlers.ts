import { rest } from 'msw';
import { sampleLiveFixture, sampleRecommendations } from './mockData';

export const handlers = [
  rest.get('/v1/health', (_, res, ctx) =>
    res(
      ctx.status(200),
      ctx.json({
        status: 'ok'
      })
    )
  ),
  rest.get('/v1/metrics/usage', (_, res, ctx) =>
    res(
      ctx.json({
        quota: 1200,
        used: 83,
        lastSyncedAt: '2026-02-18T18:20:00.000Z'
      })
    )
  ),
  rest.get('/v1/live/fixtures', (_, res, ctx) =>
    res(
      ctx.json({
        items: [
          {
            ...sampleLiveFixture,
            homeTeamName: 'Paris FC',
            awayTeamName: 'Lyon FC'
          }
        ],
        page: 1,
        limit: 20,
        total: 1
      })
    )
  ),
  rest.post('/v1/live/fixtures/sync', (_, res, ctx) =>
    res(
      ctx.json({
        fixturesSynced: 12,
        eventsSynced: 540,
        statsSynced: 24,
        lineupsSynced: 24,
        playerStatsSynced: 150
      })
    )
  ),
  rest.get('/v1/live/fixtures/:fixtureId/summary', (req, res, ctx) =>
    res(
      ctx.json({
        fixture: sampleLiveFixture,
        momentum: {
          homePressureIndex: 63,
          awayPressureIndex: 50,
          dominantSide: 'home'
        },
        dataQuality: {
          hasRecentStats: true,
          hasLineups: true,
          hasPlayerStats: true,
          isStale: false,
          flags: []
        },
        confidence: 82
      })
    )
  ),
  rest.get('/v1/live/recommendations', (_, res, ctx) =>
    res(
      ctx.json(
        sampleRecommendations.map((recommendation) => ({
          ...recommendation,
          status: 'ACTIVE'
        }))
      )
    )
  )
];

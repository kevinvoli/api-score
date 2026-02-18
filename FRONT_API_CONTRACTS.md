# FRONT API CONTRACTS - API SCORE

Date: 2026-02-18
Source: backend NestJS modules + documentation

## 1) Base URL & headers

- Base: `/v1`
- Responses: JSON with `{ data?, items?, message?, traceId? }` pattern when errors (global filter used), but success payloads follow shapes described below.
- No auth yet (environment internal). CORS expected to allow frontend host once deployed.

## 2) `GET /v1/live/fixtures`

### Query params

- `leagueId` (int)
- `statusShort` (string, values like `1H`, `HT`, `2H`, `FT`)
- `minElapsed`, `maxElapsed` (int)
- `teamId` (int)
- `page`, `limit` (int, default 1/20)
- `sortBy` (`lastSyncedAt` | `matchDate` | `elapsed`, default `lastSyncedAt`)
- `sortOrder` (`ASC` | `DESC`, default `DESC`)

### Response

```json
{
  "items": [
    {
      "id": "uuid",
      "providerFixtureId": "12345",
      "leagueId": 279,
      "season": 2025,
      "homeTeamId": 33,
      "awayTeamId": 44,
      "statusShort": "2H",
      "statusLong": "Second Half",
      "elapsed": 67,
      "matchDate": "2026-02-18T17:00:00.000Z",
      "scoreHome": 1,
      "scoreAway": 2,
      "raw": { "fixture": { ... } },
      "lastSyncedAt": "2026-02-18T18:20:00.000Z",
      "createdAt": "2026-02-18T18:05:00.000Z",
      "updatedAt": "2026-02-18T18:20:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 42
}
```

Use `items` array for `MatchCardLive` and `Live Command Center` filters. Expect `raw` for extreme stats/resync needs.

## 3) `POST /v1/live/fixtures/sync`

- Triggers ingest from API-Football. Response:

```json
{
  "fixturesSynced": 12,
  "eventsSynced": 540,
  "statsSynced": 24,
  "lineupsSynced": 24,
  "playerStatsSynced": 1200
}
```

Use to surface sync badge/time in `SystemStatusPill`.

## 4) `GET /v1/live/fixtures/:fixtureId/events`

- Returns timeline ordered by minute.

```json
[
  {
    "id": "uuid",
    "minute": 45,
    "extra": 0,
    "teamId": 33,
    "playerId": 128,
    "eventType": "Goal",
    "detail": "Penalty scored",
    "raw": { ... }
  }
]
```

Exposed to `timeline events` row; map `eventType` + `detail` to icons/labels.

## 5) `GET /v1/live/fixtures/:fixtureId/lineups`

- Returns latest snapshots per team (max 20 rows, deduped by snapshot time). Each row contains:

```json
[
  {
    "teamId": 33,
    "formation": "4-3-3",
    "coach": "Coach Name",
    "startXi": [{ "player": {...} }],
    "substitutes": [...],
    "snapshotAt": "2026-02-18T18:18:45.000Z"
  }
]
```

Show on Match Detail for lineup table/badges.

## 6) `GET /v1/live/fixtures/:fixtureId/players`

- Latest snapshots for all players (max 500 rows). Each entry includes `teamId`, `playerId`, `stats`, `snapshotAt`.
- `stats` mirrors API-Football response; expect nested structure (role, shots, passes).
- Use to populate player cards or highlight `player pressure`.

## 7) `GET /v1/live/fixtures/:fixtureId/stats/latest`

- Returns snapshots of team stats (latest `snapshotAt` per team, up to 50 rows).
- Each entry like:

```json
[
  {
    "teamId": 33,
    "elapsed": 67,
    "stats": {
      "statistics": [
        { "type": "Attacks", "value": 45 },
        { "type": "Dangerous Attacks", "value": 18 }
      ],
      "possession": { "home": 55, "away": 45 }
    }
  }
]
```

Derive momentum/pressure metrics for `MomentumBarHomeAway` + key stat badges.

## 8) `GET /v1/live/fixtures/:fixtureId/summary`

- Enriched summary computed from latest stats/lineups/events.
- Payload:

```json
{
  "fixture": {
    "providerFixtureId": "12345",
    "leagueId": 279,
    "statusShort": "2H",
    "elapsed": 67,
    "matchDate": "...",
    "score": { "home": 1, "away": 2 },
    "teams": { "homeTeamId": 33, "awayTeamId": 44 },
    "lastSyncedAt": "2026-02-18T18:20:00.000Z"
  },
  "momentum": {
    "homePressureIndex": 48.6,
    "awayPressureIndex": 42.1,
    "dominantSide": "home"
  },
  "recentEvents": [
    { "minute": 67, "type": "Corner", "detail": "Home corner", "teamId": 33 }
  ],
  "dataQuality": {
    "hasRecentStats": true,
    "hasLineups": true,
    "hasPlayerStats": true,
    "isStale": false,
    "flags": []
  },
  "confidence": 78
}
```

Use for `Match Detail` explanation block: `confidence` gauge, data quality badges, `dominantSide`, event timeline highlights.

## 9) `GET /v1/live/fixtures/:fixtureId/detail`

- Returns full fixture entity plus nested arrays `events`, `latestStats`, `latestLineups`, `latestPlayerStats`.
- Structure:

```json
{
  "fixture": { ...complete fixture entity... },
  "events": [...],
  "latestStats": [...],
  "latestLineups": [...],
  "latestPlayerStats": [...]
}
```

Use for drill-down view; fallback when chart requires raw snapshots.

## 10) Future contracts (mock data now)

- `GET /v1/live/recommendations` → list of recommendation objects with:
  - `id`, `marketType`, `selection`, `currentOdd`, `minAcceptableOdd`, `edgePct`, `confidenceScore`, `reasons`, `riskFlags`, `matchId`, `fixtureId`, `value`, `recommendedStake`.
- `GET /v1/live/recommendations/:id` → recommendation detail + history of odds drift.
- `POST /v1/coupons` (planned) → payload describing selections + stakes; response with combined odd, probability, risk level.
- `GET /v1/audit/recommendations` → historical rows with `result` (`won|lost|void`), `stake`, `payout`, `roi`.

Create mocks that respect these shapes so Storybook/gallery can render future modules before backend exists.

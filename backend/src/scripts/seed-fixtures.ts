import 'dotenv/config';
import dataSource from '../database/data-source';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureLineup } from '../database/entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from '../database/entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { Team } from '../database/entities/team.entity';

async function seed(): Promise<void> {
  await dataSource.initialize();

  const fixtureRepository = dataSource.getRepository(Fixture);
  const eventRepository = dataSource.getRepository(FixtureEvent);
  const statsRepository = dataSource.getRepository(FixtureStatsSnapshot);
  const lineupRepository = dataSource.getRepository(FixtureLineup);
  const playerStatsRepository = dataSource.getRepository(FixturePlayerStatsSnapshot);
  const recommendationRepository = dataSource.getRepository(BetRecommendation);
  const teamRepository = dataSource.getRepository(Team);

  const now = new Date();
  const fixturesSeed = [
    {
      providerFixtureId: '12345',
      leagueId: 140,
      leagueName: 'Liga',
      season: 2025,
      homeTeamId: 58,
      awayTeamId: 68,
      homeTeamName: 'Real Madrid',
      awayTeamName: 'Espanyol',
      statusShort: '1H',
      statusLong: 'First Half',
      elapsed: 18,
      matchDate: new Date(now.getTime() - 30 * 60 * 1000),
      scoreHome: 0,
      scoreAway: 0,
    },
    {
      providerFixtureId: '13456',
      leagueId: 39,
      leagueName: 'Premier League',
      season: 2025,
      homeTeamId: 42,
      awayTeamId: 50,
      homeTeamName: 'Arsenal',
      awayTeamName: 'Manchester City',
      statusShort: '2H',
      statusLong: 'Second Half',
      elapsed: 62,
      matchDate: new Date(now.getTime() - 60 * 60 * 1000),
      scoreHome: 1,
      scoreAway: 1,
    },
    {
      providerFixtureId: '14567',
      leagueId: 61,
      leagueName: 'Ligue 1',
      season: 2025,
      homeTeamId: 85,
      awayTeamId: 84,
      homeTeamName: 'Paris SG',
      awayTeamName: 'Lyon',
      statusShort: 'HT',
      statusLong: 'Halftime',
      elapsed: 45,
      matchDate: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      scoreHome: 0,
      scoreAway: 0,
    },
    {
      providerFixtureId: '15678',
      leagueId: 78,
      leagueName: 'Bundesliga',
      season: 2025,
      homeTeamId: 157,
      awayTeamId: 165,
      homeTeamName: 'Bayern Munich',
      awayTeamName: 'Borussia Dortmund',
      statusShort: '2H',
      statusLong: 'Second Half',
      elapsed: 71,
      matchDate: new Date(now.getTime() - 90 * 60 * 1000),
      scoreHome: 2,
      scoreAway: 1,
    },
    {
      providerFixtureId: '16789',
      leagueId: 135,
      leagueName: 'Serie A',
      season: 2025,
      homeTeamId: 505,
      awayTeamId: 492,
      homeTeamName: 'Inter',
      awayTeamName: 'AC Milan',
      statusShort: '1H',
      statusLong: 'First Half',
      elapsed: 23,
      matchDate: new Date(now.getTime() - 20 * 60 * 1000),
      scoreHome: 1,
      scoreAway: 0,
    },
    {
      providerFixtureId: '17890',
      leagueId: 88,
      leagueName: 'Eredivisie',
      season: 2025,
      homeTeamId: 194,
      awayTeamId: 193,
      homeTeamName: 'Ajax',
      awayTeamName: 'PSV',
      statusShort: 'HT',
      statusLong: 'Halftime',
      elapsed: 45,
      matchDate: new Date(now.getTime() - 70 * 60 * 1000),
      scoreHome: 1,
      scoreAway: 1,
    },
    {
      providerFixtureId: '18901',
      leagueId: 94,
      leagueName: 'Primeira Liga',
      season: 2025,
      homeTeamId: 211,
      awayTeamId: 212,
      homeTeamName: 'Benfica',
      awayTeamName: 'Porto',
      statusShort: '2H',
      statusLong: 'Second Half',
      elapsed: 66,
      matchDate: new Date(now.getTime() - 80 * 60 * 1000),
      scoreHome: 2,
      scoreAway: 2,
    },
    {
      providerFixtureId: '19012',
      leagueId: 307,
      leagueName: 'Saudi Pro League',
      season: 2025,
      homeTeamId: 1016,
      awayTeamId: 1019,
      homeTeamName: 'Al Hilal',
      awayTeamName: 'Al Nassr',
      statusShort: '1H',
      statusLong: 'First Half',
      elapsed: 12,
      matchDate: new Date(now.getTime() - 10 * 60 * 1000),
      scoreHome: 0,
      scoreAway: 0,
    },
    {
      providerFixtureId: '20123',
      leagueId: 253,
      leagueName: 'MLS',
      season: 2025,
      homeTeamId: 1600,
      awayTeamId: 1611,
      homeTeamName: 'LA Galaxy',
      awayTeamName: 'Inter Miami',
      statusShort: '2H',
      statusLong: 'Second Half',
      elapsed: 57,
      matchDate: new Date(now.getTime() - 95 * 60 * 1000),
      scoreHome: 1,
      scoreAway: 2,
    },
    {
      providerFixtureId: '21234',
      leagueId: 292,
      leagueName: 'Brasileirão',
      season: 2025,
      homeTeamId: 126,
      awayTeamId: 127,
      homeTeamName: 'Flamengo',
      awayTeamName: 'Palmeiras',
      statusShort: '1H',
      statusLong: 'First Half',
      elapsed: 28,
      matchDate: new Date(now.getTime() - 35 * 60 * 1000),
      scoreHome: 0,
      scoreAway: 1,
    },
  ];

  const teamsSeed = fixturesSeed.flatMap((fixture) => [
    {
      teamKey: fixture.homeTeamId,
      name: fixture.homeTeamName,
      country: null,
      founded: null,
      badge: null,
      venue: null,
      leagueId: fixture.leagueId,
      raw: { source: 'seed' },
    },
    {
      teamKey: fixture.awayTeamId,
      name: fixture.awayTeamName,
      country: null,
      founded: null,
      badge: null,
      venue: null,
      leagueId: fixture.leagueId,
      raw: { source: 'seed' },
    },
  ]);

  await teamRepository.upsert(teamsSeed, ['teamKey']);

  for (const seed of fixturesSeed) {
    await fixtureRepository.upsert(
      {
        providerFixtureId: seed.providerFixtureId,
        leagueId: seed.leagueId,
        leagueName: seed.leagueName,
        season: seed.season,
        homeTeamId: seed.homeTeamId,
        awayTeamId: seed.awayTeamId,
        homeTeamName: seed.homeTeamName,
        awayTeamName: seed.awayTeamName,
        homeTeamBadge: null,
        awayTeamBadge: null,
        statusShort: seed.statusShort,
        statusLong: seed.statusLong,
        elapsed: seed.elapsed,
        matchDate: seed.matchDate,
        scoreHome: seed.scoreHome,
        scoreAway: seed.scoreAway,
        raw: {
          fixture: { id: seed.providerFixtureId, status: { short: seed.statusShort, elapsed: seed.elapsed } },
          teams: {
            home: { id: seed.homeTeamId, name: seed.homeTeamName },
            away: { id: seed.awayTeamId, name: seed.awayTeamName }
          },
          league: { id: seed.leagueId, name: seed.leagueName }
        },
        lastSyncedAt: now,
      },
      ['providerFixtureId'],
    );

    const fixture = await fixtureRepository.findOne({
      where: { providerFixtureId: seed.providerFixtureId },
    });

    if (!fixture) {
      throw new Error(`Fixture not found after upsert (${seed.providerFixtureId}).`);
    }

    await Promise.all([
      eventRepository.delete({ fixtureId: fixture.id }),
      statsRepository.delete({ fixtureId: fixture.id }),
      lineupRepository.delete({ fixtureId: fixture.id }),
      playerStatsRepository.delete({ fixtureId: fixture.id }),
      recommendationRepository.delete({ fixtureId: fixture.id }),
    ]);

    await eventRepository.insert([
      {
        fixtureId: fixture.id,
        teamId: seed.homeTeamId,
        playerId: 101,
        assistPlayerId: null,
        minute: Math.max(5, Math.floor(seed.elapsed * 0.6)),
        extra: 0,
        eventType: 'Goal',
        detail: 'But',
        raw: { type: 'Goal', time: seed.elapsed },
      },
      {
        fixtureId: fixture.id,
        teamId: seed.awayTeamId,
        playerId: 202,
        assistPlayerId: null,
        minute: Math.max(5, Math.floor(seed.elapsed * 0.8)),
        extra: 0,
        eventType: 'Card',
        detail: 'Carton jaune',
        raw: { type: 'Card', card: 'Yellow' },
      },
    ]);

    const snapshotAt = new Date();
    await statsRepository.insert([
      {
        fixtureId: fixture.id,
        teamId: seed.homeTeamId,
        half: null,
        elapsed: seed.elapsed,
        stats: {
          statistics: [
            { type: 'Attacks', value: 45 + seed.homeTeamId % 7 },
            { type: 'Dangerous Attacks', value: 18 + seed.homeTeamId % 5 },
            { type: 'On Target', value: 6 + (seed.homeTeamId % 3) },
            { type: 'Off Target', value: 4 + (seed.homeTeamId % 4) },
            { type: 'Total Shots', value: 12 + (seed.homeTeamId % 6) },
            { type: 'Shots on Goal', value: 6 + (seed.homeTeamId % 3) },
            { type: 'Shots off Goal', value: 4 + (seed.homeTeamId % 4) },
            { type: 'Blocked Shots', value: 2 + (seed.homeTeamId % 2) },
            { type: 'Corner Kicks', value: 5 + (seed.homeTeamId % 4) },
            { type: 'Fouls', value: 8 + (seed.homeTeamId % 6) },
            { type: 'Offsides', value: 1 + (seed.homeTeamId % 3) },
            { type: 'Ball Possession', value: 55 },
            { type: 'Yellow Cards', value: 1 },
            { type: 'Red Cards', value: 0 },
          ],
          possession: { home: 55, away: 45 },
          expectedGoals: { home: 1.35, away: 0.82 },
          passes: { total: 260, accurate: 214, accuracy: '82%' },
        },
        snapshotAt,
      },
      {
        fixtureId: fixture.id,
        teamId: seed.awayTeamId,
        half: null,
        elapsed: seed.elapsed,
        stats: {
          statistics: [
            { type: 'Attacks', value: 38 + seed.awayTeamId % 7 },
            { type: 'Dangerous Attacks', value: 12 + seed.awayTeamId % 5 },
            { type: 'On Target', value: 4 + (seed.awayTeamId % 3) },
            { type: 'Off Target', value: 6 + (seed.awayTeamId % 4) },
            { type: 'Total Shots', value: 9 + (seed.awayTeamId % 6) },
            { type: 'Shots on Goal', value: 4 + (seed.awayTeamId % 3) },
            { type: 'Shots off Goal', value: 5 + (seed.awayTeamId % 4) },
            { type: 'Blocked Shots', value: 1 + (seed.awayTeamId % 2) },
            { type: 'Corner Kicks', value: 3 + (seed.awayTeamId % 4) },
            { type: 'Fouls', value: 10 + (seed.awayTeamId % 6) },
            { type: 'Offsides', value: 2 + (seed.awayTeamId % 3) },
            { type: 'Ball Possession', value: 45 },
            { type: 'Yellow Cards', value: 2 },
            { type: 'Red Cards', value: 0 },
          ],
          possession: { home: 55, away: 45 },
          expectedGoals: { home: 1.35, away: 0.82 },
          passes: { total: 230, accurate: 180, accuracy: '78%' },
        },
        snapshotAt,
      },
    ]);

    await lineupRepository.insert([
      {
        fixtureId: fixture.id,
        teamId: seed.homeTeamId,
        formation: '4-3-3',
        coach: { name: `Coach ${seed.homeTeamName}` },
        startXi: [{ player: { id: 101, name: `${seed.homeTeamName} Player 1` } }],
        substitutes: [{ player: { id: 111, name: `${seed.homeTeamName} Sub 1` } }],
        raw: { source: 'seed' },
        snapshotAt,
      },
      {
        fixtureId: fixture.id,
        teamId: seed.awayTeamId,
        formation: '4-2-3-1',
        coach: { name: `Coach ${seed.awayTeamName}` },
        startXi: [{ player: { id: 201, name: `${seed.awayTeamName} Player 1` } }],
        substitutes: [{ player: { id: 211, name: `${seed.awayTeamName} Sub 1` } }],
        raw: { source: 'seed' },
        snapshotAt,
      },
    ]);

    await playerStatsRepository.insert([
      {
        fixtureId: fixture.id,
        teamId: seed.homeTeamId,
        playerId: 101,
        stats: {
          player: { id: 101, name: `${seed.homeTeamName} Player 1` },
          statistics: [{ shots: { total: 2, on: 1 } }],
        },
        snapshotAt,
      },
      {
        fixtureId: fixture.id,
        teamId: seed.awayTeamId,
        playerId: 201,
        stats: {
          player: { id: 201, name: `${seed.awayTeamName} Player 1` },
          statistics: [{ shots: { total: 1, on: 1 } }],
        },
        snapshotAt,
      },
    ]);

    await recommendationRepository.insert([
      {
        fixtureId: fixture.id,
        marketType: 'Match Winner',
        selection: `${seed.homeTeamName} (domicile)`,
        currentOdd: 2.15,
        minAcceptableOdd: 2.0,
        edgePct: 8.2,
        confidenceScore: 88,
        reasons: ['Momentum domicile 30%', 'Tirs cadrés 6 vs 4'],
        riskFlags: [],
        status: 'ACTIVE',
      },
      {
        fixtureId: fixture.id,
        marketType: 'Goals Over/Under',
        selection: 'Plus de 2.5 buts',
        currentOdd: 1.85,
        minAcceptableOdd: 1.7,
        edgePct: 4.6,
        confidenceScore: 67,
        reasons: ['8 corners dans les 20 dernières minutes', 'Pression en hausse'],
        riskFlags: ['Corrélation forte'],
        status: 'ACTIVE',
      },
    ]);
  }

  await dataSource.destroy();
  process.stdout.write('Seed fixtures completed.\n');
}

seed().catch((error) => {
  process.stderr.write(`Seed fixtures failed: ${String(error)}\n`);
  process.exit(1);
});

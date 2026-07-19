import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureLineup } from '../database/entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from '../database/entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { Team } from '../database/entities/team.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { GetLiveFixturesQueryDto } from './dto/get-live-fixtures-query.dto';
import { toNumber, computePressureIndex } from '../common/utils/stats.utils';

@Injectable()
export class FixturesIngestionService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly apiFootballClient: ApiFootballClient,
    private readonly logger: JsonLogger,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(FixtureEvent)
    private readonly fixtureEventRepository: Repository<FixtureEvent>,
    @InjectRepository(FixtureLineup)
    private readonly fixtureLineupRepository: Repository<FixtureLineup>,
    @InjectRepository(FixturePlayerStatsSnapshot)
    private readonly fixturePlayerStatsSnapshotRepository: Repository<FixturePlayerStatsSnapshot>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly fixtureStatsSnapshotRepository: Repository<FixtureStatsSnapshot>,
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
  ) {
    this.cacheTtlMs = this.configService.get<number>(
      'LIVE_READ_CACHE_TTL_MS',
      30000,
    );
  }

  async syncLiveFixtures(): Promise<{
    fixturesSynced: number;
    eventsSynced: number;
    statsSynced: number;
    lineupsSynced: number;
    playerStatsSynced: number;
  }> {
    const liveFixtures = await this.apiFootballClient.fetchLiveFixtures();

    let eventsSynced = 0;
    let statsSynced = 0;
    let lineupsSynced = 0;
    let playerStatsSynced = 0;
    const persistedFixtures: Fixture[] = [];

    for (const payload of liveFixtures) {
      const fixture = await this.upsertFixture(payload);
      if (!fixture) {
        continue;
      }
      persistedFixtures.push(fixture);

      if (fixture.leagueId) {
        await this.upsertTeamsByLeague(fixture.leagueId);
      }
      await this.fillFixtureTeamsFromRepository(fixture);

      const fixtureId = Number(fixture.providerFixtureId);
      const events = await this.apiFootballClient.fetchFixtureEvents(fixtureId);
      eventsSynced += await this.replaceFixtureEvents(fixture.id, events);

      const stats = await this.apiFootballClient.fetchFixtureStatistics(
        fixtureId,
        undefined,
        {
          homeTeamId: fixture.homeTeamId ?? null,
          awayTeamId: fixture.awayTeamId ?? null,
        },
      );
      statsSynced += await this.insertStatsSnapshots(
        fixture.id,
        stats,
        fixture.elapsed,
      );

      const lineups = await this.apiFootballClient.fetchFixtureLineups(
        fixtureId,
        {
          homeTeamId: fixture.homeTeamId ?? null,
          awayTeamId: fixture.awayTeamId ?? null,
        },
      );
      lineupsSynced += await this.replaceFixtureLineups(fixture.id, lineups);

      const players = await this.apiFootballClient.fetchFixturePlayers(
        fixtureId,
        {
          homeTeamId: fixture.homeTeamId ?? null,
          awayTeamId: fixture.awayTeamId ?? null,
        },
      );
      playerStatsSynced += await this.insertPlayerStatsSnapshots(
        fixture.id,
        players,
      );
    }

    this.logger.log(
      {
        event: 'fixtures_sync_completed',
        fixturesSynced: persistedFixtures.length,
        eventsSynced,
        statsSynced,
        lineupsSynced,
        playerStatsSynced,
      },
      'FixturesIngestionService',
    );

    this.invalidateReadCache();

    return {
      fixturesSynced: persistedFixtures.length,
      eventsSynced,
      statsSynced,
      lineupsSynced,
      playerStatsSynced,
    };
  }

  async getLatestFixtures(query: GetLiveFixturesQueryDto): Promise<{
    items: (Fixture & { isStale: boolean })[];
    page: number;
    limit: number;
    total: number;
  }> {
    const cacheKey = this.buildCacheKey('fixtures:list', query);
    const cached = this.getFromCache<{
      items: (Fixture & { isStale: boolean })[];
      page: number;
      limit: number;
      total: number;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'lastSyncedAt';
    const sortOrder = query.sortOrder ?? 'DESC';

    const qb = this.fixtureRepository.createQueryBuilder('fixture');

    if (query.leagueId !== undefined) {
      qb.andWhere('fixture.leagueId = :leagueId', { leagueId: query.leagueId });
    }

    if (query.statusShort) {
      qb.andWhere('fixture.statusShort = :statusShort', {
        statusShort: query.statusShort,
      });
    }

    if (query.minElapsed !== undefined) {
      qb.andWhere('fixture.elapsed >= :minElapsed', {
        minElapsed: query.minElapsed,
      });
    }

    if (query.maxElapsed !== undefined) {
      qb.andWhere('fixture.elapsed <= :maxElapsed', {
        maxElapsed: query.maxElapsed,
      });
    }

    if (query.teamId !== undefined) {
      qb.andWhere(
        '(fixture.homeTeamId = :teamId OR fixture.awayTeamId = :teamId)',
        { teamId: query.teamId },
      );
    }

    qb.orderBy(`fixture.${sortBy}`, sortOrder);
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // Même convention de fraîcheur que le summary (isStale à 120 s) : un match
    // en statut live jamais re-synchronisé (sync interrompue avant sa fin)
    // resterait « en direct » pour toujours côté consommateurs.
    const items = rows.map((fixture) => ({
      ...fixture,
      isStale:
        fixture.lastSyncedAt instanceof Date
          ? Date.now() - fixture.lastSyncedAt.getTime() > 120_000
          : true,
    }));

    const result = { items, page, limit, total };
    this.setCache(cacheKey, result);
    return result;
  }

  async getFixturesHistory(query: {
    limit?: number;
  }): Promise<{ items: Fixture[]; limit: number }> {
    const limit = query.limit ?? 10;
    const items = await this.fixtureRepository.find({
      order: { matchDate: 'DESC', lastSyncedAt: 'DESC' },
      take: limit,
    });
    return { items, limit };
  }

  async getFixtureEvents(fixtureId: number): Promise<FixtureEvent[]> {
    const cacheKey = this.buildCacheKey('fixtures:events', { fixtureId });
    const cached = this.getFromCache<FixtureEvent[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return [];
    }

    const result = await this.fixtureEventRepository.find({
      where: { fixtureId: fixture.id },
      order: { createdAt: 'ASC' },
    });
    this.setCache(cacheKey, result);
    return result;
  }

  async getFixtureLineups(fixtureId: number): Promise<FixtureLineup[]> {
    const cacheKey = this.buildCacheKey('fixtures:lineups', { fixtureId });
    const cached = this.getFromCache<FixtureLineup[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return [];
    }

    const rows = await this.fixtureLineupRepository.find({
      where: { fixtureId: fixture.id },
      order: { snapshotAt: 'DESC' },
      take: 20,
    });

    const result = this.keepLatestSnapshotRows(rows);
    this.setCache(cacheKey, result);
    return result;
  }

  async getFixturePlayers(
    fixtureId: number,
  ): Promise<FixturePlayerStatsSnapshot[]> {
    const cacheKey = this.buildCacheKey('fixtures:players', { fixtureId });
    const cached = this.getFromCache<FixturePlayerStatsSnapshot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return [];
    }

    const rows = await this.fixturePlayerStatsSnapshotRepository.find({
      where: { fixtureId: fixture.id },
      order: { snapshotAt: 'DESC' },
      take: 500,
    });

    const result = this.keepLatestSnapshotRows(rows);
    this.setCache(cacheKey, result);
    return result;
  }

  async getFixtureLatestStats(
    fixtureId: number,
  ): Promise<FixtureStatsSnapshot[]> {
    const cacheKey = this.buildCacheKey('fixtures:stats:latest', { fixtureId });
    const cached = this.getFromCache<FixtureStatsSnapshot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return [];
    }

    const rows = await this.fixtureStatsSnapshotRepository.find({
      where: { fixtureId: fixture.id },
      order: { snapshotAt: 'DESC' },
      take: 50,
    });

    const result = this.keepLatestSnapshotRows(rows);
    this.setCache(cacheKey, result);
    return result;
  }

  async getFixtureSummary(
    fixtureId: number,
  ): Promise<Record<string, unknown> | null> {
    const cacheKey = this.buildCacheKey('fixtures:summary', { fixtureId });
    const cached = this.getFromCache<Record<string, unknown> | null>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return null;
    }

    const [statsRows, lineupRows, playerRows, recentEvents] = await Promise.all(
      [
        this.fixtureStatsSnapshotRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 50,
        }),
        this.fixtureLineupRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 20,
        }),
        this.fixturePlayerStatsSnapshotRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 500,
        }),
        this.fixtureEventRepository.find({
          where: { fixtureId: fixture.id },
          order: { minute: 'DESC', createdAt: 'DESC' },
          take: 5,
        }),
      ],
    );

    const latestStats = this.keepLatestSnapshotRows(statsRows);
    const latestLineups = this.keepLatestSnapshotRows(lineupRows);
    const latestPlayers = this.keepLatestSnapshotRows(playerRows);

    const homeStats =
      latestStats.find((row) => row.teamId === fixture.homeTeamId) ?? null;
    const awayStats =
      latestStats.find((row) => row.teamId === fixture.awayTeamId) ?? null;

    const homePressureIndex = computePressureIndex(homeStats?.stats ?? null);
    const awayPressureIndex = computePressureIndex(awayStats?.stats ?? null);

    const hasRecentStats = latestStats.length > 0;
    const hasLineups = latestLineups.length > 0;
    const hasPlayerStats = latestPlayers.length > 0;
    const isStale =
      fixture.lastSyncedAt instanceof Date
        ? Date.now() - fixture.lastSyncedAt.getTime() > 120_000
        : true;
    const confidence = this.computeSummaryConfidence({
      hasRecentStats,
      hasLineups,
      hasPlayerStats,
      isStale,
      homePressureIndex,
      awayPressureIndex,
      recentEventsCount: recentEvents.length,
    });

    const summary = {
      fixture: {
        providerFixtureId: fixture.providerFixtureId,
        leagueId: fixture.leagueId,
        statusShort: fixture.statusShort,
        statusLong: fixture.statusLong,
        elapsed: fixture.elapsed,
        matchDate: fixture.matchDate,
        score: {
          home: fixture.scoreHome,
          away: fixture.scoreAway,
        },
        teams: {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
        },
        lastSyncedAt: fixture.lastSyncedAt,
      },
      momentum: {
        homePressureIndex,
        awayPressureIndex,
        dominantSide:
          homePressureIndex === awayPressureIndex
            ? 'balanced'
            : homePressureIndex > awayPressureIndex
              ? 'home'
              : 'away',
      },
      recentEvents: recentEvents.map((event) => ({
        minute: event.minute,
        type: event.eventType,
        detail: event.detail,
        teamId: event.teamId,
      })),
      dataQuality: {
        hasRecentStats,
        hasLineups,
        hasPlayerStats,
        isStale,
        flags: [
          ...(hasRecentStats ? [] : ['MISSING_STATS']),
          ...(hasLineups ? [] : ['MISSING_LINEUPS']),
          ...(hasPlayerStats ? [] : ['MISSING_PLAYER_STATS']),
          ...(isStale ? ['STALE_FIXTURE_DATA'] : []),
        ],
      },
      confidence,
    };

    this.setCache(cacheKey, summary);
    return summary;
  }

  async getFixtureDetail(
    fixtureId: number,
  ): Promise<Record<string, unknown> | null> {
    const cacheKey = this.buildCacheKey('fixtures:detail', { fixtureId });
    const cached = this.getFromCache<Record<string, unknown> | null>(cacheKey);
    if (cached) {
      return cached;
    }

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: fixtureId.toString() },
    });

    if (!fixture) {
      return null;
    }

    const [events, latestStats, latestLineups, latestPlayerStats] =
      await Promise.all([
        this.fixtureEventRepository.find({
          where: { fixtureId: fixture.id },
          order: { minute: 'ASC', createdAt: 'ASC' },
        }),
        this.fixtureStatsSnapshotRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 20,
        }),
        this.fixtureLineupRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 10,
        }),
        this.fixturePlayerStatsSnapshotRepository.find({
          where: { fixtureId: fixture.id },
          order: { snapshotAt: 'DESC' },
          take: 50,
        }),
      ]);

    const result = {
      fixture,
      events,
      latestStats,
      latestLineups,
      latestPlayerStats,
    };
    this.setCache(cacheKey, result);
    return result;
  }

  private async upsertFixture(
    payload: Record<string, any>,
  ): Promise<Fixture | null> {
    const normalized = this.normalizeFixturePayload(payload);
    if (!normalized.providerFixtureId) {
      return null;
    }

    if (
      normalized.homeTeamId &&
      (!normalized.homeTeamName || !normalized.homeTeamBadge)
    ) {
      const team = await this.upsertTeamById(normalized.homeTeamId);
      if (team?.name) {
        normalized.homeTeamName = team.name;
      }
      if (team?.badge) {
        normalized.homeTeamBadge = team.badge;
      }
    }

    if (
      normalized.awayTeamId &&
      (!normalized.awayTeamName || !normalized.awayTeamBadge)
    ) {
      const team = await this.upsertTeamById(normalized.awayTeamId);
      if (team?.name) {
        normalized.awayTeamName = team.name;
      }
      if (team?.badge) {
        normalized.awayTeamBadge = team.badge;
      }
    }

    await this.fixtureRepository.upsert(
      {
        providerFixtureId: normalized.providerFixtureId,
        leagueId: normalized.leagueId,
        leagueName: normalized.leagueName,
        season: normalized.season,
        homeTeamId: normalized.homeTeamId,
        awayTeamId: normalized.awayTeamId,
        homeTeamName: normalized.homeTeamName,
        awayTeamName: normalized.awayTeamName,
        homeTeamBadge: normalized.homeTeamBadge,
        awayTeamBadge: normalized.awayTeamBadge,
        statusShort: normalized.statusShort,
        statusLong: normalized.statusLong,
        elapsed: normalized.elapsed,
        matchDate: normalized.matchDate,
        scoreHome: normalized.scoreHome,
        scoreAway: normalized.scoreAway,
        raw: payload,
        lastSyncedAt: new Date(),
      },
      ['providerFixtureId'],
    );

    return this.fixtureRepository.findOne({
      where: { providerFixtureId: normalized.providerFixtureId },
    });
  }

  private async upsertTeamsByLeague(leagueId: number): Promise<void> {
    const teams = await this.apiFootballClient.fetchTeamsByLeague(leagueId);
    if (!teams.length) {
      return;
    }

    const rows = teams
      .map((team) => this.normalizeTeamPayload(team, leagueId))
      .filter(Boolean) as Team[];
    if (!rows.length) {
      return;
    }

    await this.teamRepository.upsert(rows, ['teamKey']);
  }

  private async upsertTeamById(teamId: number): Promise<Team | null> {
    const payload = await this.apiFootballClient.fetchTeamById(teamId);
    if (!payload) {
      return null;
    }

    const row = this.normalizeTeamPayload(payload, null);
    if (!row) {
      return null;
    }

    await this.teamRepository.upsert(row, ['teamKey']);
    return this.teamRepository.findOne({ where: { teamKey: row.teamKey } });
  }

  private async fillFixtureTeamsFromRepository(
    fixture: Fixture,
  ): Promise<void> {
    if (!fixture.homeTeamId && !fixture.awayTeamId) {
      return;
    }

    const [homeTeam, awayTeam] = await Promise.all([
      fixture.homeTeamId
        ? this.teamRepository.findOne({
            where: { teamKey: fixture.homeTeamId },
          })
        : Promise.resolve(null),
      fixture.awayTeamId
        ? this.teamRepository.findOne({
            where: { teamKey: fixture.awayTeamId },
          })
        : Promise.resolve(null),
    ]);

    const updates: Partial<Fixture> = {};
    if (!fixture.homeTeamName && homeTeam?.name) {
      updates.homeTeamName = homeTeam.name;
    }
    if (!fixture.awayTeamName && awayTeam?.name) {
      updates.awayTeamName = awayTeam.name;
    }
    if (!fixture.homeTeamBadge && homeTeam?.badge) {
      updates.homeTeamBadge = homeTeam.badge;
    }
    if (!fixture.awayTeamBadge && awayTeam?.badge) {
      updates.awayTeamBadge = awayTeam.badge;
    }

    if (Object.keys(updates).length) {
      await this.fixtureRepository.update({ id: fixture.id }, updates);
    }
  }

  private normalizeTeamPayload(
    payload: Record<string, any>,
    leagueId: number | null,
  ): Team | null {
    const teamKey = toNumber(
      payload?.team_key ?? payload?.team?.id ?? payload?.team_id,
    );
    const name =
      payload?.team_name ?? payload?.team?.name ?? payload?.name ?? null;

    if (!teamKey || !name) {
      return null;
    }

    const venuePayload = payload?.venue ?? payload?.team?.venue ?? null;
    const venueId = toNumber(venuePayload?.id ?? payload?.venue_id);

    return {
      id: undefined as unknown as string,
      teamKey,
      name,
      code: payload?.team_code ?? payload?.team?.code ?? payload?.code ?? null,
      country:
        payload?.team_country ??
        payload?.team?.country ??
        payload?.country ??
        null,
      founded: toNumber(
        payload?.team_founded ?? payload?.team?.founded ?? payload?.founded,
      ),
      national:
        payload?.team_national ??
        payload?.team?.national ??
        payload?.national ??
        null,
      badge:
        payload?.team_badge ?? payload?.team?.logo ?? payload?.logo ?? null,
      venueId,
      venueName: venuePayload?.name ?? payload?.venue_name ?? null,
      venueAddress: venuePayload?.address ?? payload?.venue_address ?? null,
      venueCity: venuePayload?.city ?? payload?.venue_city ?? null,
      venueCapacity: toNumber(
        venuePayload?.capacity ?? payload?.venue_capacity,
      ),
      venueSurface: venuePayload?.surface ?? payload?.venue_surface ?? null,
      venueImage: venuePayload?.image ?? payload?.venue_image ?? null,
      venue: venuePayload,
      leagueId,
      raw: payload,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
    } as Team;
  }

  private async replaceFixtureEvents(
    fixtureId: string,
    events: Record<string, any>[],
  ): Promise<number> {
    await this.fixtureEventRepository.delete({ fixtureId });

    if (!events.length) {
      return 0;
    }

    const rows = events.map((event) => ({
      fixtureId,
      teamId: event?.team?.id ?? toNumber(event?.team_id) ?? null,
      playerId: event?.player?.id ?? toNumber(event?.player_id) ?? null,
      assistPlayerId: event?.assist?.id ?? null,
      minute: event?.time?.elapsed ?? toNumber(event?.minute) ?? null,
      extra: event?.time?.extra ?? toNumber(event?.extra) ?? null,
      eventType: event?.type ?? null,
      detail: event?.detail ?? null,
      raw: event,
    }));

    await this.fixtureEventRepository.insert(rows);
    return rows.length;
  }

  private async insertStatsSnapshots(
    fixtureId: string,
    stats: Record<string, any>[],
    elapsed: number | null,
  ): Promise<number> {
    if (!stats.length) {
      return 0;
    }

    const snapshotAt = new Date();
    const rows = stats.map((entry) => ({
      fixtureId,
      teamId: entry?.team?.id ?? toNumber(entry?.team_id) ?? null,
      half: null,
      elapsed,
      stats: entry,
      snapshotAt,
    }));

    await this.fixtureStatsSnapshotRepository.insert(rows);
    return rows.length;
  }

  private async replaceFixtureLineups(
    fixtureId: string,
    lineups: Record<string, any>[],
  ): Promise<number> {
    await this.fixtureLineupRepository.delete({ fixtureId });

    if (!lineups.length) {
      return 0;
    }

    const snapshotAt = new Date();
    const rows = lineups.map((lineup) => ({
      fixtureId,
      teamId: lineup?.team?.id ?? toNumber(lineup?.team_id) ?? null,
      formation: lineup?.formation ?? null,
      coach: lineup?.coach ?? null,
      startXi: lineup?.startXI ?? lineup?.start_xi ?? null,
      substitutes: lineup?.substitutes ?? null,
      raw: lineup,
      snapshotAt,
    }));

    await this.fixtureLineupRepository.insert(rows);
    return rows.length;
  }

  private async insertPlayerStatsSnapshots(
    fixtureId: string,
    playersPayload: Record<string, any>[],
  ): Promise<number> {
    if (!playersPayload.length) {
      return 0;
    }

    const snapshotAt = new Date();
    const rows: Array<{
      fixtureId: string;
      teamId: number | null;
      playerId: number | null;
      stats: Record<string, unknown>;
      snapshotAt: Date;
    }> = [];

    for (const teamEntry of playersPayload) {
      const teamId =
        teamEntry?.team?.id ?? toNumber(teamEntry?.team_id) ?? null;
      const players = Array.isArray(teamEntry?.players)
        ? teamEntry.players
        : [];

      for (const player of players) {
        rows.push({
          fixtureId,
          teamId,
          playerId: player?.player?.id ?? toNumber(player?.player_id) ?? null,
          stats: player,
          snapshotAt,
        });
      }
    }

    if (!rows.length) {
      return 0;
    }

    await this.fixturePlayerStatsSnapshotRepository.insert(rows);
    return rows.length;
  }

  private normalizeFixturePayload(payload: Record<string, any>): {
    providerFixtureId: string | null;
    leagueId: number | null;
    leagueName: string | null;
    season: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeTeamName: string | null;
    awayTeamName: string | null;
    homeTeamBadge: string | null;
    awayTeamBadge: string | null;
    statusShort: string | null;
    statusLong: string | null;
    elapsed: number | null;
    matchDate: Date | null;
    scoreHome: number | null;
    scoreAway: number | null;
  } {
    const apiSportsFixture = payload?.fixture ?? null;
    const legacyFixtureId = payload?.match_id ? String(payload.match_id) : null;
    const providerFixtureId = apiSportsFixture?.id
      ? String(apiSportsFixture.id)
      : legacyFixtureId;

    return {
      providerFixtureId,
      leagueId: payload?.league?.id ?? toNumber(payload?.league_id) ?? null,
      leagueName:
        payload?.league?.name ??
        payload?.league?.league_name ??
        payload?.league_name ??
        null,
      season: payload?.league?.season ?? toNumber(payload?.league_year) ?? null,
      homeTeamId:
        payload?.teams?.home?.id ??
        toNumber(payload?.match_hometeam_id) ??
        null,
      awayTeamId:
        payload?.teams?.away?.id ??
        toNumber(payload?.match_awayteam_id) ??
        null,
      homeTeamName:
        payload?.teams?.home?.name ?? payload?.match_hometeam_name ?? null,
      awayTeamName:
        payload?.teams?.away?.name ?? payload?.match_awayteam_name ?? null,
      homeTeamBadge:
        payload?.teams?.home?.logo ?? payload?.team_home_badge ?? null,
      awayTeamBadge:
        payload?.teams?.away?.logo ?? payload?.team_away_badge ?? null,
      statusShort:
        apiSportsFixture?.status?.short ??
        this.normalizeApifootballStatus(payload?.match_status),
      statusLong:
        apiSportsFixture?.status?.long ?? payload?.match_status ?? null,
      elapsed:
        apiSportsFixture?.status?.elapsed ??
        toNumber(payload?.match_status) ??
        null,
      matchDate: apiSportsFixture?.date
        ? new Date(apiSportsFixture.date)
        : this.toDate(payload?.match_date),
      scoreHome:
        payload?.goals?.home ?? toNumber(payload?.match_hometeam_score) ?? null,
      scoreAway:
        payload?.goals?.away ?? toNumber(payload?.match_awayteam_score) ?? null,
    };
  }

  private toDate(value: unknown): Date | null {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Normalise le champ match_status d'apifootball.com en code api-sports standard.
   * - ""          → "NS"   (Not Started)
   * - "75" etc.   → "LIVE" (en cours, la valeur numérique = minutes écoulées)
   * - "HT","FT","AET","ET","P","1H","2H" → inchangés (déjà compatibles)
   * - "Cancelled" → "CANC", "Postponed" → "PST", etc.
   */
  private normalizeApifootballStatus(
    raw: string | null | undefined,
  ): string | null {
    if (raw === null || raw === undefined) return null;
    if (raw === '') return 'NS';
    // "75", "45+2", mais aussi "90+" / "45+" (le + peut n'être suivi d'aucun
    // chiffre) : sans le `?`, ces deux formes traversaient sans être normalisées.
    if (/^\d+(\+\d*)?$/.test(raw)) return 'LIVE';
    const MAP: Record<string, string> = {
      // Sans ces deux entrées, 'Finished'/'Half Time' traversaient tels quels
      // (MAP[raw] ?? raw) et ne correspondaient à aucun code attendu par la
      // résolution des coupons : la branche LOST devenait inatteignable.
      Finished: 'FT',
      'Half Time': 'HT',
      Cancelled: 'CANC',
      Postponed: 'PST',
      Interrupted: 'INT',
      Abandoned: 'ABD',
      Awarded: 'AWD',
      Suspended: 'SUSP',
      'Not Coverage': 'NS',
      // apifootball termine parfois les matchs aux tirs au but avec 'Pen.'
      'Pen.': 'PEN',
    };
    return MAP[raw] ?? raw;
  }

  private keepLatestSnapshotRows<T extends { snapshotAt: Date }>(
    rows: T[],
  ): T[] {
    if (!rows.length) {
      return [];
    }

    const latestSnapshot = rows[0].snapshotAt.getTime();
    return rows.filter((row) => row.snapshotAt.getTime() === latestSnapshot);
  }

  private buildCacheKey(scope: string, payload: unknown): string {
    return `${scope}:${JSON.stringify(payload)}`;
  }

  private computeSummaryConfidence(input: {
    hasRecentStats: boolean;
    hasLineups: boolean;
    hasPlayerStats: boolean;
    isStale: boolean;
    homePressureIndex: number;
    awayPressureIndex: number;
    recentEventsCount: number;
  }): number {
    let score = 35;

    if (input.hasRecentStats) {
      score += 30;
    }
    if (input.hasLineups) {
      score += 12;
    }
    if (input.hasPlayerStats) {
      score += 12;
    }
    if (!input.isStale) {
      score += 8;
    } else {
      score -= 18;
    }

    const pressureGap = Math.abs(
      input.homePressureIndex - input.awayPressureIndex,
    );
    if (pressureGap >= 8) {
      score += 5;
    } else if (pressureGap <= 1) {
      score -= 4;
    }

    if (input.recentEventsCount >= 3) {
      score += 3;
    }

    if (!input.hasRecentStats && !input.hasLineups && !input.hasPlayerStats) {
      score = Math.min(score, 20);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getFromCache<T>(key: string): T | null {
    if (this.cacheTtlMs <= 0) {
      return null;
    }

    const current = this.cache.get(key);
    if (!current) {
      return null;
    }

    if (Date.now() > current.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return current.value as T;
  }

  private setCache(key: string, value: unknown): void {
    if (this.cacheTtlMs <= 0) {
      return;
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private invalidateReadCache(): void {
    this.cache.clear();
  }
}

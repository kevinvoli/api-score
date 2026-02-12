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
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import { GetLiveFixturesQueryDto } from './dto/get-live-fixtures-query.dto';

@Injectable()
export class FixturesIngestionService {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
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
  ) {
    this.cacheTtlMs = this.configService.get<number>('LIVE_READ_CACHE_TTL_MS', 30000);
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

      const fixtureId = Number(fixture.providerFixtureId);
      const events = await this.apiFootballClient.fetchFixtureEvents(fixtureId);
      eventsSynced += await this.replaceFixtureEvents(fixture.id, events);

      const stats = await this.apiFootballClient.fetchFixtureStatistics(fixtureId);
      statsSynced += await this.insertStatsSnapshots(fixture.id, stats, fixture.elapsed);

      const lineups = await this.apiFootballClient.fetchFixtureLineups(fixtureId);
      lineupsSynced += await this.replaceFixtureLineups(fixture.id, lineups);

      const players = await this.apiFootballClient.fetchFixturePlayers(fixtureId);
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

  async getLatestFixtures(
    query: GetLiveFixturesQueryDto,
  ): Promise<{ items: Fixture[]; page: number; limit: number; total: number }> {
    const cacheKey = this.buildCacheKey('fixtures:list', query);
    const cached = this.getFromCache<{ items: Fixture[]; page: number; limit: number; total: number }>(
      cacheKey,
    );
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

    const [items, total] = await qb.getManyAndCount();

    const result = { items, page, limit, total };
    this.setCache(cacheKey, result);
    return result;
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

  async getFixtureSummary(fixtureId: number): Promise<Record<string, unknown> | null> {
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

    const [statsRows, lineupRows, playerRows, recentEvents] = await Promise.all([
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
    ]);

    const latestStats = this.keepLatestSnapshotRows(statsRows);
    const latestLineups = this.keepLatestSnapshotRows(lineupRows);
    const latestPlayers = this.keepLatestSnapshotRows(playerRows);

    const homeStats = latestStats.find((row) => row.teamId === fixture.homeTeamId) ?? null;
    const awayStats = latestStats.find((row) => row.teamId === fixture.awayTeamId) ?? null;

    const homePressureIndex = this.computePressureIndex(homeStats?.stats ?? null);
    const awayPressureIndex = this.computePressureIndex(awayStats?.stats ?? null);

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

  async getFixtureDetail(fixtureId: number): Promise<Record<string, unknown> | null> {
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

  private async upsertFixture(payload: Record<string, any>): Promise<Fixture | null> {
    const normalized = this.normalizeFixturePayload(payload);
    if (!normalized.providerFixtureId) {
      return null;
    }

    await this.fixtureRepository.upsert(
      {
        providerFixtureId: normalized.providerFixtureId,
        leagueId: normalized.leagueId,
        season: normalized.season,
        homeTeamId: normalized.homeTeamId,
        awayTeamId: normalized.awayTeamId,
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
      teamId: event?.team?.id ?? this.toNumber(event?.team_id) ?? null,
      playerId: event?.player?.id ?? this.toNumber(event?.player_id) ?? null,
      assistPlayerId: event?.assist?.id ?? null,
      minute: event?.time?.elapsed ?? this.toNumber(event?.minute) ?? null,
      extra: event?.time?.extra ?? this.toNumber(event?.extra) ?? null,
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
      teamId: entry?.team?.id ?? this.toNumber(entry?.team_id) ?? null,
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
      teamId: lineup?.team?.id ?? this.toNumber(lineup?.team_id) ?? null,
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
      const teamId = teamEntry?.team?.id ?? this.toNumber(teamEntry?.team_id) ?? null;
      const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];

      for (const player of players) {
        rows.push({
          fixtureId,
          teamId,
          playerId: player?.player?.id ?? this.toNumber(player?.player_id) ?? null,
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
    season: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
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
      leagueId: payload?.league?.id ?? this.toNumber(payload?.league_id) ?? null,
      season: payload?.league?.season ?? this.toNumber(payload?.league_year) ?? null,
      homeTeamId: payload?.teams?.home?.id ?? this.toNumber(payload?.match_hometeam_id) ?? null,
      awayTeamId: payload?.teams?.away?.id ?? this.toNumber(payload?.match_awayteam_id) ?? null,
      statusShort: apiSportsFixture?.status?.short ?? payload?.match_status ?? null,
      statusLong: apiSportsFixture?.status?.long ?? payload?.match_status ?? null,
      elapsed: apiSportsFixture?.status?.elapsed ?? this.toNumber(payload?.match_status) ?? null,
      matchDate: apiSportsFixture?.date ? new Date(apiSportsFixture.date) : this.toDate(payload?.match_date),
      scoreHome:
        payload?.goals?.home ??
        this.toNumber(payload?.match_hometeam_score) ??
        null,
      scoreAway:
        payload?.goals?.away ??
        this.toNumber(payload?.match_awayteam_score) ??
        null,
    };
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toDate(value: unknown): Date | null {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private keepLatestSnapshotRows<T extends { snapshotAt: Date }>(rows: T[]): T[] {
    if (!rows.length) {
      return [];
    }

    const latestSnapshot = rows[0].snapshotAt.getTime();
    return rows.filter((row) => row.snapshotAt.getTime() === latestSnapshot);
  }

  private computePressureIndex(statsPayload: Record<string, unknown> | null): number {
    if (!statsPayload) {
      return 0;
    }

    const attacks = this.getStatValue(statsPayload, ['Attacks']);
    const dangerousAttacks = this.getStatValue(statsPayload, ['Dangerous Attacks']);
    const onTarget = this.getStatValue(statsPayload, ['On Target']);
    const offTarget = this.getStatValue(statsPayload, ['Off Target']);
    const corners = this.getStatValue(statsPayload, ['Corner Kicks', 'Corners']);

    return (
      dangerousAttacks * 1.4 +
      onTarget * 2 +
      corners * 1.2 +
      attacks * 0.15 -
      offTarget * 0.4
    );
  }

  private getStatValue(
    statsPayload: Record<string, unknown>,
    statNames: string[],
  ): number {
    const statistics = Array.isArray((statsPayload as { statistics?: unknown }).statistics)
      ? ((statsPayload as { statistics: Array<{ type?: unknown; value?: unknown }> })
          .statistics as Array<{ type?: unknown; value?: unknown }>)
      : [];

    for (const stat of statistics) {
      const statType = typeof stat?.type === 'string' ? stat.type : null;
      if (
        statType &&
        statNames.some((name) => name.toLowerCase() === statType.toLowerCase())
      ) {
        return this.toNumber(stat.value) ?? 0;
      }
    }

    for (const statName of statNames) {
      const legacyRaw = (statsPayload as Record<string, unknown>)[statName];
      const legacyParsed = this.toNumber(legacyRaw);
      if (legacyParsed !== null) {
        return legacyParsed;
      }
    }

    return 0;
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

    const pressureGap = Math.abs(input.homePressureIndex - input.awayPressureIndex);
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

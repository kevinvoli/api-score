import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { RateBudgetService } from '../common/services/rate-budget.service';
import { addMinutes, formatDateOnly } from '../common/utils/date.utils';
import { normalizeFixturePayload } from '../common/utils/fixture-payload.utils';
import { buildTeamStatsEntries, toNumber } from '../common/utils/stats.utils';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';

/** get_events refuse toute plage from/to dépassant 5 jours (erreur 201, vérifié). */
const MAX_WINDOW_DAYS = 5;

export interface DateWindow {
  from: Date;
  to: Date;
}

export interface HistoryImportResult {
  leagueId: number;
  from: string;
  to: string;
  windowsProcessed: number;
  matchesFound: number;
  fixturesUpserted: number;
  snapshotsCreated: number;
  eventsCreated: number;
  goalsImported: number;
  apiCallsUsed: number;
}

interface PersistMatchResult {
  fixtureId: string | null;
  snapshotsCreated: number;
  eventsCreated: number;
  goalsImported: number;
}

@Injectable()
export class HistoryImportService {
  constructor(
    private readonly apiFootballClient: ApiFootballClient,
    private readonly rateBudgetService: RateBudgetService,
    private readonly logger: JsonLogger,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly fixtureStatsSnapshotRepository: Repository<FixtureStatsSnapshot>,
    @InjectRepository(FixtureEvent)
    private readonly fixtureEventRepository: Repository<FixtureEvent>,
  ) {}

  /**
   * Importe l'historique d'un championnat sur [from, to]. Découpe en fenêtres
   * de 5 jours max (contrainte provider), dé-doublonne les matchs vus dans
   * plusieurs fenêtres, puis persiste fixtures + snapshots MT/FT + buts.
   * Idempotent : réimporter la même plage n'insère aucun doublon (upsert sur
   * `providerFixtureId`, purge-puis-réinsertion pour snapshots/events).
   */
  async importLeagueSeason(
    leagueId: number,
    from: Date,
    to: Date,
  ): Promise<HistoryImportResult> {
    const windows = this.buildWindows(from, to);
    const apiCalls = { count: 0 };
    const matchesByProviderId = new Map<string, Record<string, unknown>>();

    for (const window of windows) {
      await this.waitForRateBudget();
      const matches = await this.apiFootballClient.fetchLeagueFixtures(
        leagueId,
        formatDateOnly(window.from),
        formatDateOnly(window.to),
      );
      apiCalls.count += 1;

      for (const match of matches as Record<string, unknown>[]) {
        const providerFixtureId = this.extractProviderFixtureId(match);
        if (providerFixtureId) {
          matchesByProviderId.set(providerFixtureId, match);
        }
      }
    }

    let fixturesUpserted = 0;
    let snapshotsCreated = 0;
    let eventsCreated = 0;
    let goalsImported = 0;

    for (const match of matchesByProviderId.values()) {
      const result = await this.persistMatch(match, apiCalls);
      if (result.fixtureId) {
        fixturesUpserted += 1;
      }
      snapshotsCreated += result.snapshotsCreated;
      eventsCreated += result.eventsCreated;
      goalsImported += result.goalsImported;
    }

    const result: HistoryImportResult = {
      leagueId,
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      windowsProcessed: windows.length,
      matchesFound: matchesByProviderId.size,
      fixturesUpserted,
      snapshotsCreated,
      eventsCreated,
      goalsImported,
      apiCallsUsed: apiCalls.count,
    };

    this.logger.log(
      { event: 'history_import_completed', ...result },
      'HistoryImportService',
    );

    return result;
  }

  private buildWindows(from: Date, to: Date): DateWindow[] {
    const windows: DateWindow[] = [];
    const windowSpanMs = (MAX_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000;
    let cursor = new Date(from);

    while (cursor.getTime() <= to.getTime()) {
      const windowEnd = new Date(
        Math.min(cursor.getTime() + windowSpanMs, to.getTime()),
      );
      windows.push({ from: new Date(cursor), to: windowEnd });
      cursor = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    return windows;
  }

  private extractProviderFixtureId(
    match: Record<string, unknown>,
  ): string | null {
    const apiSportsFixture = match?.fixture as { id?: unknown } | undefined;
    if (apiSportsFixture?.id) {
      return String(apiSportsFixture.id);
    }
    return match?.match_id ? String(match.match_id) : null;
  }

  private async persistMatch(
    payload: Record<string, unknown>,
    apiCalls: { count: number },
  ): Promise<PersistMatchResult> {
    const normalized = normalizeFixturePayload(payload);
    if (!normalized.providerFixtureId) {
      return {
        fixtureId: null,
        snapshotsCreated: 0,
        eventsCreated: 0,
        goalsImported: 0,
      };
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

    const fixture = await this.fixtureRepository.findOne({
      where: { providerFixtureId: normalized.providerFixtureId },
    });
    if (!fixture) {
      return {
        fixtureId: null,
        snapshotsCreated: 0,
        eventsCreated: 0,
        goalsImported: 0,
      };
    }

    const matchDate = normalized.matchDate ?? new Date();
    const details =
      this.apiFootballClient.getProvider() === 'apifootball'
        ? this.buildApifootballDetails(
            payload,
            normalized.homeTeamId,
            normalized.awayTeamId,
            matchDate,
          )
        : await this.fetchApiSportsDetails(
            fixture,
            normalized.homeTeamId,
            normalized.awayTeamId,
            matchDate,
            apiCalls,
          );

    const snapshotRows = details.snapshotRows.map((row) => ({
      ...row,
      fixtureId: fixture.id,
    }));
    const eventRows = details.eventRows.map((row) => ({
      ...row,
      fixtureId: fixture.id,
    }));

    // Idempotence : purge puis réinsertion des lignes de CETTE fixture — un
    // réimport de la même période ne duplique jamais rien.
    await this.fixtureStatsSnapshotRepository.delete({
      fixtureId: fixture.id,
    });
    if (snapshotRows.length) {
      await this.fixtureStatsSnapshotRepository.insert(snapshotRows);
    }

    await this.fixtureEventRepository.delete({ fixtureId: fixture.id });
    if (eventRows.length) {
      await this.fixtureEventRepository.insert(eventRows);
    }

    return {
      fixtureId: fixture.id,
      snapshotsCreated: details.snapshotRows.length,
      eventsCreated: details.eventRows.length,
      goalsImported: details.eventRows.length,
    };
  }

  /**
   * apifootball (provider vérifié en production) : `statistics_1half` et
   * `statistics` sont déjà embarqués dans le payload get_events, aucun appel
   * réseau supplémentaire n'est nécessaire par match.
   */
  private buildApifootballDetails(
    payload: Record<string, unknown>,
    homeTeamId: number | null,
    awayTeamId: number | null,
    matchDate: Date,
  ): {
    snapshotRows: Partial<FixtureStatsSnapshot>[];
    eventRows: Partial<FixtureEvent>[];
  } {
    return {
      snapshotRows: this.buildSnapshotRowsFromEmbeddedStats(
        payload,
        homeTeamId,
        awayTeamId,
        matchDate,
      ),
      eventRows: this.buildEventRowsFromGoalscorer(
        payload,
        homeTeamId,
        awayTeamId,
      ),
    };
  }

  private buildSnapshotRowsFromEmbeddedStats(
    payload: Record<string, unknown>,
    homeTeamId: number | null,
    awayTeamId: number | null,
    matchDate: Date,
  ): Partial<FixtureStatsSnapshot>[] {
    const rows: Partial<FixtureStatsSnapshot>[] = [];

    const halftimeEntries = buildTeamStatsEntries(
      payload?.statistics_1half as
        | { type?: string; home?: unknown; away?: unknown }[]
        | undefined,
      homeTeamId,
      awayTeamId,
    );
    const halftimeAt = addMinutes(matchDate, 45);
    for (const entry of halftimeEntries) {
      rows.push({
        teamId: entry.team_id,
        half: '1',
        elapsed: 45,
        stats: entry as unknown as Record<string, unknown>,
        snapshotAt: halftimeAt,
      });
    }

    const finalEntries = buildTeamStatsEntries(
      payload?.statistics as
        | { type?: string; home?: unknown; away?: unknown }[]
        | undefined,
      homeTeamId,
      awayTeamId,
    );
    const finalAt = addMinutes(matchDate, 90);
    for (const entry of finalEntries) {
      rows.push({
        teamId: entry.team_id,
        half: '2',
        elapsed: 90,
        stats: entry as unknown as Record<string, unknown>,
        snapshotAt: finalAt,
      });
    }

    return rows;
  }

  private buildEventRowsFromGoalscorer(
    payload: Record<string, unknown>,
    homeTeamId: number | null,
    awayTeamId: number | null,
  ): Partial<FixtureEvent>[] {
    const goals = Array.isArray(payload?.goalscorer)
      ? (payload.goalscorer as Record<string, unknown>[])
      : [];
    const rows: Partial<FixtureEvent>[] = [];

    for (const goal of goals) {
      const minute = toNumber(goal?.time);
      if (goal?.home_scorer) {
        rows.push(
          this.buildGoalEventRow(
            goal,
            homeTeamId,
            toNumber(goal?.home_scorer_id),
            minute,
          ),
        );
      }
      if (goal?.away_scorer) {
        rows.push(
          this.buildGoalEventRow(
            goal,
            awayTeamId,
            toNumber(goal?.away_scorer_id),
            minute,
          ),
        );
      }
    }

    return rows;
  }

  private buildGoalEventRow(
    goal: Record<string, unknown>,
    teamId: number | null,
    playerId: number | null,
    minute: number | null,
  ): Partial<FixtureEvent> {
    return {
      teamId,
      playerId,
      assistPlayerId: null,
      minute,
      extra: null,
      eventType: 'Goal',
      detail: (goal?.info as string) || 'Goal',
      raw: goal,
    };
  }

  /**
   * apisports : non vérifié en conditions réelles (l'abonnement en place est
   * apifootball). Reprend le même schéma d'appels que l'ingestion live —
   * `fetchFixtureStatistics(half)` pour la MT, sans `half` pour le cumul
   * final, `fetchFixtureEvents` filtré sur les buts.
   */
  private async fetchApiSportsDetails(
    fixture: Fixture,
    homeTeamId: number | null,
    awayTeamId: number | null,
    matchDate: Date,
    apiCalls: { count: number },
  ): Promise<{
    snapshotRows: Partial<FixtureStatsSnapshot>[];
    eventRows: Partial<FixtureEvent>[];
  }> {
    const fixtureId = Number(fixture.providerFixtureId);
    const teamIds = { homeTeamId, awayTeamId };

    await this.waitForRateBudget();
    const halftimeStats = await this.apiFootballClient.fetchFixtureStatistics(
      fixtureId,
      'first',
      teamIds,
    );
    apiCalls.count += 1;

    await this.waitForRateBudget();
    const finalStats = await this.apiFootballClient.fetchFixtureStatistics(
      fixtureId,
      undefined,
      teamIds,
    );
    apiCalls.count += 1;

    await this.waitForRateBudget();
    const events = await this.apiFootballClient.fetchFixtureEvents(fixtureId);
    apiCalls.count += 1;

    const snapshotRows: Partial<FixtureStatsSnapshot>[] = [];
    const halftimeAt = addMinutes(matchDate, 45);
    for (const entry of halftimeStats as Record<string, unknown>[]) {
      snapshotRows.push({
        teamId: toNumber(entry?.team_id),
        half: '1',
        elapsed: 45,
        stats: entry as unknown as Record<string, unknown>,
        snapshotAt: halftimeAt,
      });
    }
    const finalAt = addMinutes(matchDate, 90);
    for (const entry of finalStats as Record<string, unknown>[]) {
      snapshotRows.push({
        teamId: toNumber(entry?.team_id),
        half: '2',
        elapsed: 90,
        stats: entry as unknown as Record<string, unknown>,
        snapshotAt: finalAt,
      });
    }

    const eventRows = (events as Record<string, unknown>[])
      .filter((event) => event?.type === 'Goal')
      .map((event) => {
        const time = event?.time as
          | { elapsed?: number; extra?: number }
          | undefined;
        const player = event?.player as { id?: number } | undefined;
        const assist = event?.assist as { id?: number } | undefined;
        const team = event?.team as { id?: number } | undefined;
        return {
          teamId: team?.id ?? null,
          playerId: player?.id ?? null,
          assistPlayerId: assist?.id ?? null,
          minute: time?.elapsed ?? null,
          extra: time?.extra ?? null,
          eventType: event?.type as string,
          detail: (event?.detail as string) ?? null,
          raw: event,
        };
      });

    return { snapshotRows, eventRows };
  }

  private async waitForRateBudget(): Promise<void> {
    while (!(await this.rateBudgetService.hasBudget())) {
      this.logger.warn(
        { event: 'history_import_throttled' },
        'HistoryImportService',
      );
      await this.sleep(2000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

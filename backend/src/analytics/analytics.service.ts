import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixtureAnalytics } from '../database/entities/fixture-analytics.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { toNumber, getStatValue, computePressureIndex } from '../common/utils/stats.utils';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(FixtureAnalytics)
    private readonly analyticsRepository: Repository<FixtureAnalytics>,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly statsRepository: Repository<FixtureStatsSnapshot>,
    @InjectRepository(FixtureEvent)
    private readonly eventsRepository: Repository<FixtureEvent>,
  ) {}

  async getLatestForFixture(fixtureId: string): Promise<FixtureAnalytics | null> {
    return this.analyticsRepository.findOne({
      where: { fixtureId },
      order: { computedAt: 'DESC' },
    });
  }

  async recomputeFixture(fixtureId: string): Promise<FixtureAnalytics | null> {
    const fixture = await this.fixtureRepository.findOne({ where: { id: fixtureId } });
    if (!fixture) {
      return null;
    }

    const statsRows = await this.statsRepository.find({
      where: { fixtureId },
      order: { snapshotAt: 'DESC' },
      take: 50,
    });
    const latestSnapshotAt = statsRows[0]?.snapshotAt?.getTime();
    const latestStats = latestSnapshotAt
      ? statsRows.filter((row) => row.snapshotAt.getTime() === latestSnapshotAt)
      : [];

    const events = await this.eventsRepository.find({
      where: { fixtureId },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const homeStats = latestStats.find((row) => row.teamId === fixture.homeTeamId) ?? null;
    const awayStats = latestStats.find((row) => row.teamId === fixture.awayTeamId) ?? null;

    const metrics = {
      fixtureId,
      providerFixtureId: fixture.providerFixtureId,
      score: { home: fixture.scoreHome, away: fixture.scoreAway },
      elapsed: fixture.elapsed,
      pressureIndex: {
        home: computePressureIndex(homeStats?.stats ?? null),
        away: computePressureIndex(awayStats?.stats ?? null),
      },
      possession: {
        home: getStatValue(homeStats?.stats ?? null, ['Ball Possession', 'Possession']),
        away: getStatValue(awayStats?.stats ?? null, ['Ball Possession', 'Possession']),
      },
      shots: {
        home: getStatValue(homeStats?.stats ?? null, ['Total Shots', 'Shots']),
        away: getStatValue(awayStats?.stats ?? null, ['Total Shots', 'Shots']),
      },
      onTarget: {
        home: getStatValue(homeStats?.stats ?? null, ['On Target', 'Shots on Goal']),
        away: getStatValue(awayStats?.stats ?? null, ['On Target', 'Shots on Goal']),
      },
      offTarget: {
        home: getStatValue(homeStats?.stats ?? null, ['Off Target', 'Shots off Goal']),
        away: getStatValue(awayStats?.stats ?? null, ['Off Target', 'Shots off Goal']),
      },
      corners: {
        home: getStatValue(homeStats?.stats ?? null, ['Corner Kicks', 'Corners']),
        away: getStatValue(awayStats?.stats ?? null, ['Corner Kicks', 'Corners']),
      },
      fouls: {
        home: getStatValue(homeStats?.stats ?? null, ['Fouls']),
        away: getStatValue(awayStats?.stats ?? null, ['Fouls']),
      },
      offsides: {
        home: getStatValue(homeStats?.stats ?? null, ['Offsides']),
        away: getStatValue(awayStats?.stats ?? null, ['Offsides']),
      },
      attacks: {
        home: getStatValue(homeStats?.stats ?? null, ['Attacks']),
        away: getStatValue(awayStats?.stats ?? null, ['Attacks']),
      },
      dangerousAttacks: {
        home: getStatValue(homeStats?.stats ?? null, ['Dangerous Attacks']),
        away: getStatValue(awayStats?.stats ?? null, ['Dangerous Attacks']),
      },
      expectedGoals: {
        home: getStatValue(homeStats?.stats ?? null, ['Expected Goals', 'xG']),
        away: getStatValue(awayStats?.stats ?? null, ['Expected Goals', 'xG']),
      },
      passes: {
        home: this.extractPasses(homeStats?.stats ?? null),
        away: this.extractPasses(awayStats?.stats ?? null),
      },
      cards: {
        home: events.filter((event) => event.teamId === fixture.homeTeamId && event.eventType === 'Card').length,
        away: events.filter((event) => event.teamId === fixture.awayTeamId && event.eventType === 'Card').length,
      },
      yellowCards: {
        home: this.countCards(events, fixture.homeTeamId, 'yellow'),
        away: this.countCards(events, fixture.awayTeamId, 'yellow'),
      },
      redCards: {
        home: this.countCards(events, fixture.homeTeamId, 'red'),
        away: this.countCards(events, fixture.awayTeamId, 'red'),
      },
      goals: {
        home: events.filter((event) => event.teamId === fixture.homeTeamId && event.eventType === 'Goal').length,
        away: events.filter((event) => event.teamId === fixture.awayTeamId && event.eventType === 'Goal').length,
      },
      recentEventsCount: events.length,
    };

    const entry = this.analyticsRepository.create({
      fixtureId,
      metrics,
    });
    await this.analyticsRepository.insert(entry);
    return this.getLatestForFixture(fixtureId);
  }

  async getLatest(limit = 10): Promise<{ items: FixtureAnalytics[]; limit: number }> {
    const items = await this.analyticsRepository.find({
      order: { computedAt: 'DESC' },
      take: limit,
    });
    return { items, limit };
  }

  async recomputeLatest(limit = 10): Promise<{ items: FixtureAnalytics[]; limit: number }> {
    const fixtures = await this.fixtureRepository.find({
      order: { matchDate: 'DESC', lastSyncedAt: 'DESC' },
      take: limit,
    });

    const results: FixtureAnalytics[] = [];
    for (const fixture of fixtures) {
      const entry = await this.recomputeFixture(fixture.id);
      if (entry) {
        results.push(entry);
      }
    }

    return { items: results, limit };
  }




  private extractPasses(statsPayload: Record<string, unknown> | null): {
    total: number;
    accurate: number;
    accuracy: number;
  } {
    if (!statsPayload) {
      return { total: 0, accurate: 0, accuracy: 0 };
    }

    const legacyPasses = (statsPayload as Record<string, any>).passes;
    if (legacyPasses && typeof legacyPasses === 'object') {
      const total = toNumber(legacyPasses.total) ?? 0;
      const accurate = toNumber(legacyPasses.accurate) ?? 0;
      const accuracy = toNumber(
        typeof legacyPasses.accuracy === 'string'
          ? legacyPasses.accuracy.replace('%', '')
          : legacyPasses.accuracy,
      ) ?? 0;
      return { total, accurate, accuracy };
    }

    const total = getStatValue(statsPayload, ['Total Passes', 'Passes']);
    const accurate = getStatValue(statsPayload, ['Accurate Passes', 'Pass Accuracy']);
    const accuracy = total > 0 ? Math.round((accurate / total) * 100) : 0;
    return { total, accurate, accuracy };
  }

  private countCards(events: FixtureEvent[], teamId: number | null, type: 'yellow' | 'red'): number {
    if (!teamId) {
      return 0;
    }

    return events.filter((event) => {
      if (event.teamId !== teamId || event.eventType !== 'Card') {
        return false;
      }
      const detail = (event.detail ?? '').toLowerCase();
      return type === 'yellow'
        ? detail.includes('yellow')
        : detail.includes('red');
    }).length;
  }
}

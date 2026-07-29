import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { BaseRate } from '../database/entities/base-rate.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import {
  BaseRateMarket,
  BaseRateSignal,
  buildObservations,
  computeBaseRates,
  TeamMatchObservation,
} from './base-rates.calculator';

/** En dessous, un taux n'est pas statistiquement exploitable. */
const DEFAULT_MIN_SAMPLE = 20;

export interface RecomputeResult {
  leagueSeasonPairs: number;
  observations: number;
  ratesUpserted: number;
}

@Injectable()
export class BaseRatesService {
  constructor(
    @InjectRepository(BaseRate)
    private readonly baseRateRepository: Repository<BaseRate>,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly snapshotRepository: Repository<FixtureStatsSnapshot>,
    @InjectRepository(FixtureEvent)
    private readonly eventRepository: Repository<FixtureEvent>,
    private readonly logger: JsonLogger,
  ) {}

  /** Recalcule les taux de base pour toutes les paires (championnat, saison). */
  async recomputeAll(minSample = DEFAULT_MIN_SAMPLE): Promise<RecomputeResult> {
    const pairs = await this.fixtureRepository
      .createQueryBuilder('f')
      .select('f.leagueId', 'leagueId')
      .addSelect('f.season', 'season')
      .where('f.leagueId IS NOT NULL')
      .andWhere('f.season IS NOT NULL')
      .groupBy('f.leagueId')
      .addGroupBy('f.season')
      .getRawMany<{ leagueId: number; season: number }>();

    let observations = 0;
    let ratesUpserted = 0;

    for (const { leagueId, season } of pairs) {
      const result = await this.recomputeLeagueSeason(
        Number(leagueId),
        Number(season),
        minSample,
      );
      observations += result.observations;
      ratesUpserted += result.ratesUpserted;
    }

    const summary: RecomputeResult = {
      leagueSeasonPairs: pairs.length,
      observations,
      ratesUpserted,
    };
    this.logger.log(
      { event: 'base_rates_recomputed', ...summary },
      'BaseRatesService',
    );
    return summary;
  }

  async recomputeLeagueSeason(
    leagueId: number,
    season: number,
    minSample = DEFAULT_MIN_SAMPLE,
  ): Promise<{ observations: number; ratesUpserted: number }> {
    const fixtures = await this.fixtureRepository.find({
      where: { leagueId, season },
      select: ['id', 'leagueId', 'season', 'homeTeamId', 'awayTeamId'],
    });
    if (!fixtures.length) {
      return { observations: 0, ratesUpserted: 0 };
    }

    const fixtureIds = fixtures.map((f) => f.id);
    const [snapshots, goals] = await Promise.all([
      this.snapshotRepository.find({
        where: { fixtureId: In(fixtureIds) },
        select: ['fixtureId', 'teamId', 'half', 'stats'],
      }),
      this.eventRepository.find({
        where: { fixtureId: In(fixtureIds), eventType: 'Goal' },
        select: ['fixtureId', 'teamId', 'minute'],
      }),
    ]);

    const snapshotsByFixture = groupBy(snapshots, (s) => s.fixtureId);
    const goalsByFixture = groupBy(goals, (g) => g.fixtureId);

    const observations: TeamMatchObservation[] = [];
    for (const fixture of fixtures) {
      observations.push(
        ...buildObservations(
          {
            leagueId: fixture.leagueId,
            season: fixture.season,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
          },
          snapshotsByFixture.get(fixture.id) ?? [],
          goalsByFixture.get(fixture.id) ?? [],
        ),
      );
    }

    const rates = computeBaseRates(observations, { minSample });

    // Remplacement : on efface les taux de la paire avant réinsertion, pour ne
    // pas laisser de lignes périmées (seuil devenu sans échantillon).
    await this.baseRateRepository.delete({ leagueId, season });
    if (rates.length) {
      await this.baseRateRepository.insert(
        rates.map((r) => ({
          leagueId: r.leagueId,
          season: r.season,
          market: r.market,
          signal: r.signal,
          threshold: r.threshold,
          sampleSize: r.sampleSize,
          observedRate: r.observedRate,
        })),
      );
    }

    return { observations: observations.length, ratesUpserted: rates.length };
  }

  /** Filtre pour l'endpoint public. */
  async findRates(filter: {
    leagueId?: number;
    season?: number;
    market?: string;
    signal?: string;
  }): Promise<BaseRate[]> {
    const where: Record<string, unknown> = {};
    if (filter.leagueId !== undefined) where.leagueId = filter.leagueId;
    if (filter.season !== undefined) where.season = filter.season;
    if (filter.market !== undefined) where.market = filter.market;
    if (filter.signal !== undefined) where.signal = filter.signal;

    return this.baseRateRepository.find({
      where,
      order: {
        leagueId: 'ASC',
        season: 'DESC',
        market: 'ASC',
        signal: 'ASC',
        threshold: 'ASC',
      },
      take: 2000,
    });
  }

  /**
   * Précharge en une requête les taux d'un signal pour un lot de paires
   * (championnat, saison), pour un lookup O(1) en mémoire dans le hot-path live
   * — évite un aller-retour DB par suggestion. Clé : `baseRateKey(...)`.
   */
  async buildLookup(
    pairs: { leagueId: number; season: number }[],
    signal: BaseRateSignal,
  ): Promise<Map<string, { observedRate: number; sampleSize: number }>> {
    const lookup = new Map<
      string,
      { observedRate: number; sampleSize: number }
    >();
    if (!pairs.length) return lookup;

    const leagueIds = [...new Set(pairs.map((p) => p.leagueId))];
    const seasons = [...new Set(pairs.map((p) => p.season))];

    const rows = await this.baseRateRepository.find({
      where: { signal, leagueId: In(leagueIds), season: In(seasons) },
    });

    for (const row of rows) {
      lookup.set(
        baseRateKey(row.leagueId, row.season, row.market, row.threshold),
        { observedRate: row.observedRate, sampleSize: row.sampleSize },
      );
    }
    return lookup;
  }

  /**
   * Taux de base pour un signal donné à un seuil ≥ celui demandé : on retient
   * le taux du seuil calculé le plus proche par au-dessus (le plus exigeant que
   * l'observation satisfait encore), avec son échantillon. `null` si aucun.
   */
  async lookupRate(params: {
    leagueId: number;
    season: number;
    market: BaseRateMarket;
    signal: BaseRateSignal;
    threshold: number;
  }): Promise<{ observedRate: number; sampleSize: number } | null> {
    const row = await this.baseRateRepository.findOne({
      where: {
        leagueId: params.leagueId,
        season: params.season,
        market: params.market,
        signal: params.signal,
        threshold: params.threshold,
      },
    });
    if (!row) return null;
    return { observedRate: row.observedRate, sampleSize: row.sampleSize };
  }
}

/** Clé de lookup d'un taux de base préchargé (voir `buildLookup`). */
export function baseRateKey(
  leagueId: number,
  season: number,
  market: string,
  threshold: number,
): string {
  return `${leagueId}|${season}|${market}|${threshold}`;
}

/** Libellé de marché des règles live → marché des taux de base. */
export const MARKET_TYPE_TO_BASE_RATE: Record<string, BaseRateMarket> = {
  'Buts 1ère mi-temps': 'goal_1h',
  'Buts match': 'goal_ft',
  'Buts 2ème mi-temps': 'goal_2h',
};

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

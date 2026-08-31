import {
  computePressureIndex,
  extractTotalShots,
  getStatValue,
} from '../common/utils/stats.utils';

/** Événement dont on mesure la fréquence de réalisation. */
export const BASE_RATE_MARKETS = ['goal_1h', 'goal_2h', 'goal_ft'] as const;
export type BaseRateMarket = (typeof BASE_RATE_MARKETS)[number];

/** Signal offensif évalué au moment de décision. */
export const BASE_RATE_SIGNALS = [
  'total_shots',
  'on_target',
  'pressure_index',
] as const;
export type BaseRateSignal = (typeof BASE_RATE_SIGNALS)[number];

/**
 * Seuils par défaut, propres à chaque signal : les tirs se comptent à l'unité,
 * l'indice de pression est un composite pondéré d'ordre de grandeur bien plus
 * élevé.
 */
export const DEFAULT_THRESHOLDS: Record<BaseRateSignal, number[]> = {
  total_shots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  on_target: [1, 2, 3, 4, 5, 6, 7, 8],
  pressure_index: [10, 20, 30, 40, 50, 60, 70, 80],
};

/** Une équipe dans un match, pour un marché donné. */
export interface TeamMatchObservation {
  leagueId: number;
  season: number;
  market: BaseRateMarket;
  signals: Record<BaseRateSignal, number>;
  eventOccurred: boolean;
}

export interface ComputedBaseRate {
  leagueId: number;
  season: number;
  market: BaseRateMarket;
  signal: BaseRateSignal;
  threshold: number;
  sampleSize: number;
  observedRate: number;
}

export interface BaseRateOptions {
  thresholdsBySignal?: Partial<Record<BaseRateSignal, number[]>>;
  /** Taux ignorés en dessous de cet échantillon (un taux sur 3 matchs ne vaut rien). */
  minSample?: number;
}

// --- Extraction : lignes DB brutes → observations -------------------------

export interface FixtureRow {
  leagueId: number | null;
  season: number | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
}

export interface SnapshotRow {
  teamId: number | null;
  half: string | null;
  stats: Record<string, unknown>;
}

export interface GoalRow {
  teamId: number | null;
  minute: number | null;
}

function signalsOf(
  stats: Record<string, unknown>,
): Record<BaseRateSignal, number> {
  return {
    total_shots: extractTotalShots(stats) ?? 0,
    on_target: getStatValue(stats, ['On Target', 'Shots on Goal']),
    pressure_index: computePressureIndex(stats),
  };
}

function diffSignals(
  full: Record<BaseRateSignal, number>,
  first: Record<BaseRateSignal, number>,
): Record<BaseRateSignal, number> {
  return {
    total_shots: Math.max(0, full.total_shots - first.total_shots),
    on_target: Math.max(0, full.on_target - first.on_target),
    pressure_index: Math.max(0, full.pressure_index - first.pressure_index),
  };
}

/**
 * Construit les observations d'un match (une par équipe et par marché). Un
 * marché n'est émis que si le snapshot nécessaire existe : le taux de base ne
 * doit pas être dilué par des matchs dont on ignore le signal.
 *
 * - `goal_1h` / `goal_ft` : signal mesuré au snapshot mi-temps (half='1').
 * - `goal_2h` : signal = snapshot final (half='2', cumulatif) − mi-temps.
 */
export function buildObservations(
  fixture: FixtureRow,
  snapshots: SnapshotRow[],
  goals: GoalRow[],
): TeamMatchObservation[] {
  const { leagueId, season } = fixture;
  if (leagueId === null || season === null) {
    return [];
  }

  const observations: TeamMatchObservation[] = [];
  const teams: (number | null)[] = [fixture.homeTeamId, fixture.awayTeamId];

  for (const teamId of teams) {
    if (teamId === null) continue;

    const half1 = snapshots.find((s) => s.teamId === teamId && s.half === '1');
    const half2 = snapshots.find((s) => s.teamId === teamId && s.half === '2');

    const teamGoals = goals.filter((g) => g.teamId === teamId);
    const scored1h = teamGoals.some((g) => g.minute !== null && g.minute <= 45);
    const scored2h = teamGoals.some((g) => g.minute !== null && g.minute > 45);
    const scoredFt = teamGoals.length > 0;

    if (half1) {
      const firstSignals = signalsOf(half1.stats);
      observations.push({
        leagueId,
        season,
        market: 'goal_1h',
        signals: firstSignals,
        eventOccurred: scored1h,
      });
      observations.push({
        leagueId,
        season,
        market: 'goal_ft',
        signals: firstSignals,
        eventOccurred: scoredFt,
      });

      if (half2) {
        observations.push({
          leagueId,
          season,
          market: 'goal_2h',
          signals: diffSignals(signalsOf(half2.stats), firstSignals),
          eventOccurred: scored2h,
        });
      }
    }
  }

  return observations;
}

// --- Agrégation : observations → taux de base -----------------------------

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function groupKey(o: TeamMatchObservation): string {
  return `${o.leagueId}|${o.season}|${o.market}`;
}

/**
 * Agrège les observations en taux de base : pour chaque (championnat, saison,
 * marché, signal, seuil), la fraction d'équipes-matchs à `signal >= seuil` qui
 * ont réalisé l'événement. Fonction pure — aucun accès DB.
 */
export function computeBaseRates(
  observations: TeamMatchObservation[],
  options: BaseRateOptions = {},
): ComputedBaseRate[] {
  const minSample = options.minSample ?? 1;
  const thresholdsFor = (signal: BaseRateSignal): number[] =>
    options.thresholdsBySignal?.[signal] ?? DEFAULT_THRESHOLDS[signal];

  const groups = new Map<string, TeamMatchObservation[]>();
  for (const obs of observations) {
    const key = groupKey(obs);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(obs);
    } else {
      groups.set(key, [obs]);
    }
  }

  const rates: ComputedBaseRate[] = [];

  for (const bucket of groups.values()) {
    const { leagueId, season, market } = bucket[0];

    for (const signal of BASE_RATE_SIGNALS) {
      for (const threshold of thresholdsFor(signal)) {
        let sampleSize = 0;
        let positives = 0;
        for (const obs of bucket) {
          if (obs.signals[signal] >= threshold) {
            sampleSize += 1;
            if (obs.eventOccurred) positives += 1;
          }
        }

        if (sampleSize < minSample) continue;

        rates.push({
          leagueId,
          season,
          market,
          signal,
          threshold,
          sampleSize,
          observedRate: round4(positives / sampleSize),
        });
      }
    }
  }

  return rates;
}

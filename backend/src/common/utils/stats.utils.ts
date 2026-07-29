export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getStatValue(
  statsPayload: Record<string, unknown> | null,
  statNames: string[],
): number {
  if (!statsPayload) {
    return 0;
  }

  const statistics = Array.isArray(
    (statsPayload as { statistics?: unknown }).statistics,
  )
    ? ((
        statsPayload as {
          statistics: Array<{ type?: unknown; value?: unknown }>;
        }
      ).statistics as Array<{ type?: unknown; value?: unknown }>)
    : [];

  for (const stat of statistics) {
    const statType = typeof stat?.type === 'string' ? stat.type : null;
    if (
      statType &&
      statNames.some((name) => name.toLowerCase() === statType.toLowerCase())
    ) {
      return toNumber(stat.value) ?? 0;
    }
  }

  for (const statName of statNames) {
    const legacyRaw = (statsPayload as Record<string, unknown>)[statName];
    const legacyParsed = toNumber(legacyRaw);
    if (legacyParsed !== null) {
      return legacyParsed;
    }
  }

  return 0;
}

const TOTAL_SHOTS_TYPES = ['total shots', 'shots total'];

/** Extrait le nombre total de tirs d'un snapshot de stats (api-sports ou apifootball). */
export function extractTotalShots(
  stats: Record<string, unknown>,
): number | null {
  const statistics = stats?.statistics;
  if (Array.isArray(statistics)) {
    const arr = statistics as Array<{ type?: string; value?: unknown }>;

    for (const entry of arr) {
      if (entry.type && TOTAL_SHOTS_TYPES.includes(entry.type.toLowerCase())) {
        const n = Number(entry.value);
        if (!Number.isNaN(n)) return n;
      }
    }

    // Fallback : On Target + Off Target (format apifootball)
    const getValue = (type: string) => {
      const e = arr.find((x) => x.type?.toLowerCase() === type);
      return e ? Number(e.value) : NaN;
    };
    const onTarget = getValue('on target');
    const offTarget = getValue('off target');
    if (!Number.isNaN(onTarget) && !Number.isNaN(offTarget))
      return onTarget + offTarget;
    if (!Number.isNaN(onTarget)) return onTarget;
  }

  const flat = stats?.total_shots ?? stats?.shots;
  if (flat !== undefined) {
    const n = Number(flat);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

interface ApiSportsHalftimeScore {
  score?: { halftime?: { home?: unknown; away?: unknown } };
}

/** Extrait le score à la mi-temps depuis le champ `raw` d'une fixture. */
export function extractHtScore(
  raw: Record<string, unknown>,
  isHome: boolean,
): number | null {
  // Format apifootball
  const apifootballKey = isHome
    ? 'match_hometeam_halftime_score'
    : 'match_awayteam_halftime_score';
  if (raw[apifootballKey] !== undefined && raw[apifootballKey] !== '') {
    const n = Number(raw[apifootballKey]);
    if (!Number.isNaN(n)) return n;
  }
  // Format api-sports
  const apiSportsScore = (raw as ApiSportsHalftimeScore)?.score?.halftime;
  if (apiSportsScore) {
    const val = isHome ? apiSportsScore.home : apiSportsScore.away;
    if (val !== null && val !== undefined) {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

export interface RawTeamStatEntry {
  type?: string;
  home?: unknown;
  away?: unknown;
}

export interface TeamStatsEntry {
  team_id: number | null;
  statistics: Array<{ type: string | undefined; value: unknown }>;
}

/**
 * Répartit un tableau de stats `{type, home, away}` (format apifootball,
 * partagé par get_statistics ET get_events) en une entrée par équipe,
 * `{team_id, statistics: [{type, value}]}` — la forme persistée dans
 * `fixture_stats_snapshots.stats`. Partagé entre ApiFootballClient (live) et
 * HistoryImportService (historique) pour garantir une forme identique.
 */
export function buildTeamStatsEntries(
  statistics: RawTeamStatEntry[] | undefined,
  homeTeamId: number | null,
  awayTeamId: number | null,
): TeamStatsEntry[] {
  if (!Array.isArray(statistics) || !statistics.length) {
    return [];
  }

  return [
    {
      team_id: homeTeamId,
      statistics: statistics.map((stat) => ({
        type: stat.type,
        value: stat.home,
      })),
    },
    {
      team_id: awayTeamId,
      statistics: statistics.map((stat) => ({
        type: stat.type,
        value: stat.away,
      })),
    },
  ];
}

export function computePressureIndex(
  statsPayload: Record<string, unknown> | null,
): number {
  if (!statsPayload) {
    return 0;
  }

  const attacks = getStatValue(statsPayload, ['Attacks']);
  const dangerousAttacks = getStatValue(statsPayload, ['Dangerous Attacks']);
  const onTarget = getStatValue(statsPayload, ['On Target', 'Shots on Goal']);
  const offTarget = getStatValue(statsPayload, [
    'Off Target',
    'Shots off Goal',
  ]);
  const corners = getStatValue(statsPayload, ['Corner Kicks', 'Corners']);

  return (
    dangerousAttacks * 1.4 +
    onTarget * 2 +
    corners * 1.2 +
    attacks * 0.15 -
    offTarget * 0.4
  );
}

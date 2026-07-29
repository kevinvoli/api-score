import { toNumber } from './stats.utils';
import { normalizeApifootballStatus } from './status.utils';

export interface NormalizedFixturePayload {
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
}

function toDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * apifootball renvoie `league_year` sous la forme `'2025/2026'` (chaîne), que
 * `toNumber` transformait en NaN → saison perdue. On retient l'année de début.
 * Accepte aussi `'2025-2026'`, `'2025'` et un nombre brut (api-sports).
 */
export function parseSeasonYear(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const match = /\d{4}/.exec(value);
    return match ? Number(match[0]) : null;
  }
  return null;
}

/**
 * Mappe un payload fixture provider (api-sports imbriqué ou apifootball à
 * plat) vers la forme normalisée persistée dans `fixtures`. Extrait de
 * FixturesIngestionService le 20/07/2026 pour être partagé avec l'import
 * historique : les payloads apifootball (live comme historique) partagent
 * exactement les mêmes champs `match_*`.
 */
export function normalizeFixturePayload(
  payload: Record<string, any>,
): NormalizedFixturePayload {
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
    season:
      parseSeasonYear(payload?.league?.season) ??
      parseSeasonYear(payload?.league_year) ??
      null,
    homeTeamId:
      payload?.teams?.home?.id ?? toNumber(payload?.match_hometeam_id) ?? null,
    awayTeamId:
      payload?.teams?.away?.id ?? toNumber(payload?.match_awayteam_id) ?? null,
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
      normalizeApifootballStatus(payload?.match_status),
    statusLong: apiSportsFixture?.status?.long ?? payload?.match_status ?? null,
    elapsed:
      apiSportsFixture?.status?.elapsed ??
      toNumber(payload?.match_status) ??
      null,
    matchDate: apiSportsFixture?.date
      ? new Date(apiSportsFixture.date)
      : toDate(payload?.match_date),
    scoreHome:
      payload?.goals?.home ?? toNumber(payload?.match_hometeam_score) ?? null,
    scoreAway:
      payload?.goals?.away ?? toNumber(payload?.match_awayteam_score) ?? null,
  };
}

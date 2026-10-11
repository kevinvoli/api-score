/**
 * Mapping du format de cotes apifootball (action `get_odds`) vers les
 * (marketType, outcome) internes. Isolé du service d'ingestion pour ne pas
 * mélanger le parsing du format provider avec l'orchestration DB.
 *
 * Format réel observé (une ligne plate par match × bookmaker, ex. match
 * 690949 du 2026-03-06) : les champs non proposés par le bookmaker valent la
 * chaîne vide "", jamais null — ils sont ignorés silencieusement ici.
 */
import { impliedProbability } from './odds-math';
import { toNumber } from '../common/utils/stats.utils';

export interface ApifootballOddsOutcome {
  outcome: string;
  oddValue: number;
}

export interface ApifootballExecutableOddsOutcome
  extends ApifootballOddsOutcome {
  bookmakerName: string;
  marketType: string;
  marketKey: string;
  selectionKey: string;
  available: boolean;
}

const OU_LINES = [
  '0.5',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '3.5',
  '4',
  '4.5',
  '5',
  '5.5',
];

// Lignes de handicap asiatique exposées par apifootball. Note : `ah+0.5_2`
// n'existe jamais dans le payload (vérifié sur données réelles) — cette ligne
// ne peut donc jamais former de paire complète. On la garde dans la liste :
// le rejet standard des marchés incomplets (côté OddsIngestionService) s'en
// charge sans qu'il soit nécessaire de la traiter à part.
const AH_LINES = [
  '-4.5',
  '-4',
  '-3.5',
  '-3',
  '-2.5',
  '-2',
  '-1.5',
  '-1',
  '0',
  '+0.5',
  '+1',
  '+1.5',
  '+2',
  '+2.5',
  '+3',
  '+3.5',
  '+4',
  '+4.5',
];

/**
 * Extrait les groupes (marketType → outcomes) d'une ligne de cotes apifootball
 * (un objet = un bookmaker pour un match donné).
 */
export function mapApifootballOddsEntry(
  entry: Record<string, unknown>,
): Map<string, ApifootballOddsOutcome[]> {
  const groups = new Map<string, ApifootballOddsOutcome[]>();

  const push = (marketType: string, outcome: string, raw: unknown): void => {
    const oddValue = toNumber(raw);
    if (oddValue === null || impliedProbability(oddValue) === null) {
      return;
    }
    const bucket = groups.get(marketType) ?? [];
    bucket.push({ outcome, oddValue });
    groups.set(marketType, bucket);
  };

  push('1X2', 'HOME', entry['odd_1']);
  push('1X2', 'DRAW', entry['odd_x']);
  push('1X2', 'AWAY', entry['odd_2']);

  // Double chance : non-partition, chaque issue couvre 2 des 3 résultats.
  push('DOUBLE_CHANCE', 'HOME_DRAW', entry['odd_1x']);
  push('DOUBLE_CHANCE', 'HOME_AWAY', entry['odd_12']);
  push('DOUBLE_CHANCE', 'DRAW_AWAY', entry['odd_x2']);

  for (const line of OU_LINES) {
    push(`OU_${line}`, 'OVER', entry[`o+${line}`]);
    push(`OU_${line}`, 'UNDER', entry[`u+${line}`]);
  }

  for (const line of AH_LINES) {
    push(`AH_${line}`, 'HOME', entry[`ah${line}_1`]);
    push(`AH_${line}`, 'AWAY', entry[`ah${line}_2`]);
  }

  push('BTTS', 'YES', entry['bts_yes']);
  push('BTTS', 'NO', entry['bts_no']);

  return groups;
}

export function mapApifootballLiveOddsEntry(
  entry: Record<string, unknown>,
): ApifootballExecutableOddsOutcome[] {
  const nested = Array.isArray(entry['live_odds'])
    ? (entry['live_odds'] as Record<string, unknown>[])
    : [entry];
  const parentBookmaker = bookmakerNameOf(entry);
  const mapped: ApifootballExecutableOddsOutcome[] = [];

  for (const odd of nested) {
    const bookmakerName = bookmakerNameOf(odd) ?? parentBookmaker;
    if (!bookmakerName) continue;

    const oddValue = toNumber(odd['value'] ?? odd['odd']);
    if (oddValue === null || impliedProbability(oddValue) === null) continue;

    const identity = liveMarketIdentity(odd);
    if (!identity) continue;

    mapped.push({
      bookmakerName,
      marketType: identity.marketKey,
      outcome: identity.selectionKey,
      marketKey: identity.marketKey,
      selectionKey: identity.selectionKey,
      oddValue,
      available: !isSuspended(odd['suspended']),
    });
  }

  return mapped;
}

function bookmakerNameOf(entry: Record<string, unknown>): string | null {
  for (const key of [
    'odd_bookmakers',
    'bookmaker_name',
    'bookmaker',
    'bookmakerName',
  ]) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isSuspended(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function liveMarketIdentity(
  odd: Record<string, unknown>,
): { marketKey: string; selectionKey: string } | null {
  const name = String(odd['odd_name'] ?? '').trim();
  const type = String(odd['type'] ?? '')
    .trim()
    .toLowerCase();
  const handicap = String(odd['handicap'] ?? '').trim();
  const side = name.startsWith('Home')
    ? 'HOME'
    : name.startsWith('Away')
      ? 'AWAY'
      : null;
  if (!side) return null;

  if (name.endsWith('Team Score a Goal (1st Half)') && type === 'yes') {
    return { marketKey: 'TEAM_GOAL_1H', selectionKey: `${side}_YES` };
  }
  if (name.endsWith('Team Score a Goal (2nd Half)') && type === 'yes') {
    return { marketKey: 'TEAM_GOAL_2H', selectionKey: `${side}_YES` };
  }
  if (name.endsWith('Team Goals') && type === 'over' && handicap === '0.5') {
    return {
      marketKey: 'TEAM_GOALS_FT',
      selectionKey: `${side}_OVER_0.5`,
    };
  }
  return null;
}

/** true si le marché est une partition d'issues exclusives et exhaustives
 * (l'overround et la probabilité "fair" y ont un sens) ; false sinon
 * (ex. double chance, dont la somme des probabilités brutes vaut ~2). */
export function isPartitionMarket(marketType: string): boolean {
  return marketType !== 'DOUBLE_CHANCE' && !marketType.startsWith('TEAM_GOAL');
}

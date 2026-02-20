import type { LiveFixture } from '../types/live';

export const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const formatPercent = (value: unknown) => `${toNumber(value, 0)}%`;

export const formatValue = (value: unknown, suffix = '') => {
  const parsed = toNumber(value, 0);
  return `${parsed}${suffix}`;
};

export const getTeamName = (fixture: LiveFixture | undefined, side: 'home' | 'away') => {
  if (!fixture) return side === 'home' ? 'Domicile' : 'ExtÃ©rieur';
  const explicit = side === 'home' ? fixture.homeTeamName : fixture.awayTeamName;
  if (explicit) return explicit;

  const raw = fixture.raw as Record<string, any> | undefined;
  return (
    raw?.teams?.[side]?.name ??
    raw?.[side === 'home' ? 'homeTeam' : 'awayTeam']?.name ??
    raw?.[side === 'home' ? 'match_hometeam_name' : 'match_awayteam_name'] ??
    (side === 'home' ? 'Domicile' : 'ExtÃ©rieur')
  );
};

export const getTeamBadge = (fixture: LiveFixture | undefined, side: 'home' | 'away') => {
  if (!fixture) return null;
  const explicit = side === 'home' ? fixture.homeTeamBadge : fixture.awayTeamBadge;
  if (explicit) return explicit;

  const raw = fixture.raw as Record<string, any> | undefined;
  return (
    raw?.teams?.[side]?.logo ??
    raw?.[side === 'home' ? 'team_home_badge' : 'team_away_badge'] ??
    null
  );
};

export const getLeagueName = (fixture: LiveFixture | undefined) => {
  if (!fixture?.raw || typeof fixture.raw !== 'object') return null;
  const raw = fixture.raw as Record<string, any>;
  return raw?.league?.name ?? raw?.league_name ?? raw?.league?.league_name ?? null;
};

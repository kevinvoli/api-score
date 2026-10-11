import { BacktestStrategy } from './backtest.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Garde structurelle d'une stratégie reçue en JSON libre : tout ce que le
 * rejeu lit doit exister et être borné, sinon 400 avant tout gel.
 */
export function isWalkForwardStrategy(
  value: unknown,
): value is BacktestStrategy {
  if (!isRecord(value)) return false;
  const { entryRules, staking, odds, markets } = value;
  if (typeof value.name !== 'string' || !value.name.trim()) return false;
  if (
    !Array.isArray(markets) ||
    !markets.length ||
    !markets.every((m) => typeof m === 'string')
  ) {
    return false;
  }
  if (!isFiniteNumber(value.minEdgePct) || !isFiniteNumber(value.minConfidence))
    return false;
  if (!isFiniteNumber(value.bankroll) || value.bankroll < 0) return false;
  if (
    !isRecord(staking) ||
    (staking.type !== 'FLAT' && staking.type !== 'PERCENT_BANKROLL') ||
    !isFiniteNumber(staking.amount) ||
    staking.amount < 0 ||
    (staking.type === 'PERCENT_BANKROLL' && staking.amount > 100)
  ) {
    return false;
  }
  if (!isRecord(odds) || !Array.isArray(odds.source)) return false;
  return (
    isRecord(entryRules) &&
    Array.isArray(entryRules.firstHalfRules) &&
    entryRules.firstHalfRules.length > 0 &&
    isRecord(entryRules.secondHalfRule) &&
    isRecord(entryRules.odds)
  );
}

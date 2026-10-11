import {
  DEFAULT_CONFIG,
  SmartRulesConfig,
} from '../settings/smart-rules-config.service';
import { BacktestStrategy } from './backtest.types';

/**
 * Baseline = les règles heuristiques du live, sans filtre supplémentaire
 * (minEdgePct/minConfidence à 0 pour reproduire exactement ce que le live
 * aurait parié). C'est la référence que tout futur modèle devra battre.
 */
export function baselineStrategy(
  entryRules: SmartRulesConfig = DEFAULT_CONFIG,
): BacktestStrategy {
  return {
    name: 'baseline-shots-pressure',
    version: '1.0.0',
    // Copie : muter la stratégie ne doit jamais modifier la configuration par défaut du processus.
    entryRules: structuredClone(entryRules),
    markets: ['Buts 1ère mi-temps', 'Buts match', 'Buts 2ème mi-temps'],
    minEdgePct: 0,
    minConfidence: 0,
    staking: { type: 'FLAT', amount: 1 },
    odds: {
      source: ['ODDS_SNAPSHOT'],
      executionLatencyMs: 30_000,
    },
    bankroll: 100,
  };
}

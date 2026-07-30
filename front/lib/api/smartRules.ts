import { apiFetch } from './client';

export type HalfRule = { maxElapsed: number; minShots: number };

export type OddsConfig = { current: number; min: number; edgePct: number; confidence: number };

export type ShotSignal = 'TOTAL_SHOTS' | 'ON_TARGET' | 'PRESSURE_INDEX';

export type ScoreStateModifiers = { leading: number; trailing: number; drawing: number };

export type SmartRulesConfig = {
  firstHalfRules: HalfRule[];
  secondHalfRule: HalfRule;
  odds: {
    firstHalfHT: OddsConfig;
    firstHalfFT: OddsConfig;
    secondHalf:  OddsConfig;
  };
  signal?: ShotSignal;
  scoreStateModifiers?: ScoreStateModifiers;
};

export const DEFAULT_CONFIG: SmartRulesConfig = {
  firstHalfRules: [
    { maxElapsed: 10, minShots: 5  },
    { maxElapsed: 20, minShots: 7  },
    { maxElapsed: 30, minShots: 10 },
    { maxElapsed: 40, minShots: 13 },
    { maxElapsed: 45, minShots: 16 },
  ],
  secondHalfRule: { maxElapsed: 60, minShots: 5 },
  odds: {
    firstHalfHT: { current: 1.75, min: 1.60, edgePct: 12.5, confidence: 70 },
    firstHalfFT: { current: 1.45, min: 1.35, edgePct:  8.0, confidence: 75 },
    secondHalf:  { current: 1.65, min: 1.50, edgePct: 10.0, confidence: 72 },
  },
  signal: 'TOTAL_SHOTS',
  scoreStateModifiers: { leading: 0, trailing: 0, drawing: 0 },
};

export const fetchSmartRules = (): Promise<SmartRulesConfig> =>
  apiFetch<SmartRulesConfig>('/v1/settings/smart-rules');

export const updateSmartRules = (config: SmartRulesConfig): Promise<SmartRulesConfig> =>
  apiFetch<SmartRulesConfig>('/v1/settings/smart-rules', {
    method: 'PUT',
    body:   JSON.stringify(config),
    headers: { 'Content-Type': 'application/json' },
  });

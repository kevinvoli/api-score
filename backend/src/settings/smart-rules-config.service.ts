import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppRuntimeState } from '../database/entities/app-runtime-state.entity';

export type HalfRule = { maxElapsed: number; minShots: number };

/** Signal offensif servant de critère de déclenchement (LOT 3). */
export const SIGNAL_TYPES = [
  'TOTAL_SHOTS',
  'ON_TARGET',
  'PRESSURE_INDEX',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

/**
 * Ajustement du seuil de déclenchement selon l'état au score de l'équipe
 * (LOT 3.4). Ajouté au `minShots` : positif = plus exigeant, négatif = plus
 * permissif. Une équipe menée pousse davantage → on peut abaisser le seuil ;
 * une équipe qui mène lève le pied → on le relève.
 */
export type ScoreStateModifiers = {
  leading: number;
  trailing: number;
  drawing: number;
};

export type SmartRulesConfig = {
  /** Critère de déclenchement des règles (défaut TOTAL_SHOTS). */
  signal?: SignalType;
  /** Modulation du seuil selon l'état au score (défaut neutre : 0 partout). */
  scoreStateModifiers?: ScoreStateModifiers;
  /** Règles progressives sur la 1ère mi-temps */
  firstHalfRules: HalfRule[];
  /** Règle unique pour la 2ème mi-temps */
  secondHalfRule: HalfRule;
  /** Cotes et seuils pour chaque type de suggestion */
  odds: {
    firstHalfHT: {
      current: number;
      min: number;
      edgePct: number;
      confidence: number;
    };
    firstHalfFT: {
      current: number;
      min: number;
      edgePct: number;
      confidence: number;
    };
    secondHalf: {
      current: number;
      min: number;
      edgePct: number;
      confidence: number;
    };
  };
};

const STATE_KEY = 'smart-rules-config';

export const DEFAULT_CONFIG: SmartRulesConfig = {
  signal: 'TOTAL_SHOTS',
  scoreStateModifiers: { leading: 0, trailing: 0, drawing: 0 },
  firstHalfRules: [
    { maxElapsed: 10, minShots: 5 },
    { maxElapsed: 20, minShots: 7 },
    { maxElapsed: 30, minShots: 10 },
    { maxElapsed: 40, minShots: 13 },
    { maxElapsed: 45, minShots: 16 },
  ],
  secondHalfRule: { maxElapsed: 60, minShots: 5 },
  odds: {
    firstHalfHT: { current: 1.75, min: 1.6, edgePct: 12.5, confidence: 70 },
    firstHalfFT: { current: 1.45, min: 1.35, edgePct: 8.0, confidence: 75 },
    secondHalf: { current: 1.65, min: 1.5, edgePct: 10.0, confidence: 72 },
  },
};

@Injectable()
export class SmartRulesConfigService {
  constructor(
    @InjectRepository(AppRuntimeState)
    private readonly stateRepo: Repository<AppRuntimeState>,
  ) {}

  async getConfig(): Promise<SmartRulesConfig> {
    const state = await this.stateRepo.findOne({ where: { key: STATE_KEY } });
    if (!state) return DEFAULT_CONFIG;
    return state.value as unknown as SmartRulesConfig;
  }

  async updateConfig(config: SmartRulesConfig): Promise<SmartRulesConfig> {
    let state = await this.stateRepo.findOne({ where: { key: STATE_KEY } });
    if (state) {
      state.value = config as unknown as Record<string, unknown>;
    } else {
      state = this.stateRepo.create({
        key: STATE_KEY,
        value: config as unknown as Record<string, unknown>,
      });
    }
    await this.stateRepo.save(state);
    return config;
  }
}

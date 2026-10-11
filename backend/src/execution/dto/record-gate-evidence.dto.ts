import { Type } from 'class-transformer';
import { IsDate, IsIn, IsObject, Matches } from 'class-validator';
import {
  GATE_KEYS,
  GATE_VERDICTS,
  GateKey,
  GateVerdict,
} from '../execution.types';

/** `POST /execution/gate-evidence` : preuve immuable, approuvée par l'ADMIN qui l'enregistre. */
export class RecordGateEvidenceDto {
  @IsIn(GATE_KEYS)
  gateKey: GateKey;

  @Type(() => Date)
  @IsDate()
  periodFrom: Date;

  @Type(() => Date)
  @IsDate()
  periodTo: Date;

  /** Métriques et seuils gelés du rapport (ex. walk-forward : runId, folds, ROI, IC). */
  @IsObject()
  metrics: Record<string, unknown>;

  /** sha256 du rapport de preuve, en hexadécimal minuscule. */
  @Matches(/^[0-9a-f]{64}$/)
  reportHash: string;

  @IsIn(GATE_VERDICTS)
  verdict: GateVerdict;
}

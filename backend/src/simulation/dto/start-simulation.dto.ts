import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Montant décimal strictement positif, deux décimales au plus, borné à 10^10. */
const POSITIVE_AMOUNT = /^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/;

export class SimulationRiskDto {
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxStakePerBet?: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxOpenExposure?: string;
}

/** Contrat PLAN 3.3 : `POST /simulation/runs`. Rejouer la même clé renvoie le même run. */
export class StartSimulationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  idempotencyKey: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,40}$/)
  strategyVersion: string;

  /** Stratégie complète, validée structurellement par le contrôleur avant gel. */
  @IsObject()
  strategy: Record<string, unknown>;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @IsString()
  @Matches(POSITIVE_AMOUNT)
  initialBankroll: string;

  @IsInt()
  @Min(1_000)
  @Max(600_000)
  maxQuoteAgeMs: number;

  @IsInt()
  @Min(0)
  @Max(300_000)
  executionLatencyMs: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  bookmakerKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulationRiskDto)
  risk?: SimulationRiskDto;
}

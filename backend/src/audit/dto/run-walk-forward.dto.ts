import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Contrat PLAN 3.3 : `POST /audit/walk-forward`. Toutes les bornes sont fermées. */
export class RunWalkForwardDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,40}$/)
  strategyVersion: string;

  /** Stratégie complète, validée structurellement par le contrôleur avant gel. */
  @IsObject()
  strategy: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @Max(365)
  trainWindowDays: number;

  @IsInt()
  @Min(1)
  @Max(180)
  validationWindowDays: number;

  @IsInt()
  @Min(1)
  @Max(180)
  testWindowDays: number;

  @IsInt()
  @Min(1)
  @Max(365)
  stepDays: number;

  @Type(() => Date)
  @IsDate()
  from: Date;

  @Type(() => Date)
  @IsDate()
  to: Date;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/\S/)
  bookmakerKey?: string;

  @IsInt()
  @Min(1_000)
  @Max(600_000)
  maxQuoteAgeMs: number;

  @IsInt()
  @Min(0)
  @Max(300_000)
  executionLatencyMs: number;
}

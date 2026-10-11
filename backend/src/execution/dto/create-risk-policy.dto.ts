import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Montant strictement positif, deux décimales au plus, borné à 10^10. */
const POSITIVE_AMOUNT = /^(?!0+(?:\.0{1,2})?$)\d{1,10}(?:\.\d{1,2})?$/;

/** `POST /execution/risk-policies` : crée une version immuable, active seulement contrôle arrêté. */
export class CreateRiskPolicyDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxStakePerBet: string;

  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxDailyStake: string;

  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxDailyLoss: string;

  @IsString()
  @Matches(POSITIVE_AMOUNT)
  maxOpenExposure: string;

  @IsInt()
  @Min(1_000)
  @Max(600_000)
  maxQuoteAgeMs: number;

  @IsBoolean()
  activate: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

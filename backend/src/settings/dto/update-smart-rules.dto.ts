import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SIGNAL_TYPES } from '../smart-rules-config.service';

/** Fenêtre de déclenchement : « avant maxElapsed minutes, au moins minShots tirs ». */
export class HalfRuleDto {
  @IsInt()
  @Min(1)
  @Max(120)
  maxElapsed: number;

  @IsInt()
  @Min(1)
  @Max(50)
  minShots: number;
}

/** Cote de référence indicative et seuils d'affichage associés à un marché. */
export class OddsConfigDto {
  @IsNumber()
  @Min(1.01)
  @Max(50)
  current: number;

  @IsNumber()
  @Min(1.01)
  @Max(50)
  min: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  edgePct: number;

  @IsInt()
  @Min(0)
  @Max(100)
  confidence: number;
}

export class OddsSettingsDto {
  @ValidateNested()
  @Type(() => OddsConfigDto)
  firstHalfHT: OddsConfigDto;

  @ValidateNested()
  @Type(() => OddsConfigDto)
  firstHalfFT: OddsConfigDto;

  @ValidateNested()
  @Type(() => OddsConfigDto)
  secondHalf: OddsConfigDto;
}

/** Décalages de seuil selon l'état au score (LOT 3.4). */
export class ScoreStateModifiersDto {
  @IsInt()
  @Min(-20)
  @Max(20)
  leading: number;

  @IsInt()
  @Min(-20)
  @Max(20)
  trailing: number;

  @IsInt()
  @Min(-20)
  @Max(20)
  drawing: number;
}

export class UpdateSmartRulesDto {
  @IsOptional()
  @IsIn(SIGNAL_TYPES)
  signal?: (typeof SIGNAL_TYPES)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoreStateModifiersDto)
  scoreStateModifiers?: ScoreStateModifiersDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HalfRuleDto)
  firstHalfRules: HalfRuleDto[];

  @ValidateNested()
  @Type(() => HalfRuleDto)
  secondHalfRule: HalfRuleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OddsSettingsDto)
  odds?: OddsSettingsDto;
}

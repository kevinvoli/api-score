import { Type } from 'class-transformer';
import { IsDate, IsObject, IsOptional, IsString } from 'class-validator';

export class RunBacktestDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** Stratégie complète ; absente → baseline (règles live actuelles). */
  @IsOptional()
  @IsObject()
  strategy?: Record<string, unknown>;

  /**
   * LOT A.5 : config de règles (`SmartRulesConfig`) à tester telle quelle,
   * typiquement la version en cours d'édition dans Paramètres — pas encore
   * sauvegardée. Ignorée si `strategy` est fourni. Absente des deux →
   * baseline sur la config actuellement persistée.
   */
  @IsOptional()
  @IsObject()
  entryRules?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  windowStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  windowEnd?: Date;
}

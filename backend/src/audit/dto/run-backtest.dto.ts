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

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  windowStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  windowEnd?: Date;
}

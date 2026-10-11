import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Contrat 3.4 : `PUT /execution/control/stop`. */
export class StopExecutionDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason: string;

  /** Informative : un arrêt n'est jamais refusé pour une version périmée. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

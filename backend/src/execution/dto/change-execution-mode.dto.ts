import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { EXECUTION_MODES, ExecutionMode } from '../execution.types';

/** Contrat 3.4 : `PUT /execution/control/mode`. */
export class ChangeExecutionModeDto {
  @IsIn(EXECUTION_MODES)
  targetMode: ExecutionMode;

  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  gateEvidenceIds: string[];
}

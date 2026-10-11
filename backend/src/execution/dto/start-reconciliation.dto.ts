import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** `POST /execution/reconciliations` : run idempotent sur une plage → `202 { runId }`. */
export class StartReconciliationDto {
  @IsUUID()
  accountId: string;

  @Type(() => Date)
  @IsDate()
  from: Date;

  @Type(() => Date)
  @IsDate()
  to: Date;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9:_-]{8,128}$/)
  idempotencyKey?: string;
}

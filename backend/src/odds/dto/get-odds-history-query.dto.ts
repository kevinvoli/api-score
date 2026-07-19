import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetOddsHistoryQueryDto {
  @IsOptional()
  @IsString()
  marketType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  bookmakerId?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 200;
}

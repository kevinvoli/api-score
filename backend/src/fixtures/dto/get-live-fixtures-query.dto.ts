import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetLiveFixturesQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  leagueId?: number;

  @IsOptional()
  @IsString()
  statusShort?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  minElapsed?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  maxElapsed?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  teamId?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['lastSyncedAt', 'matchDate', 'elapsed'])
  sortBy?: 'lastSyncedAt' | 'matchDate' | 'elapsed' = 'lastSyncedAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

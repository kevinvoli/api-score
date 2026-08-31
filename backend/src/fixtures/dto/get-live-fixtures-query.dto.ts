import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GetLiveFixturesQueryDto extends PaginationQueryDto {
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
  @IsIn(['lastSyncedAt', 'matchDate', 'elapsed'])
  sortBy?: 'lastSyncedAt' | 'matchDate' | 'elapsed' = 'lastSyncedAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

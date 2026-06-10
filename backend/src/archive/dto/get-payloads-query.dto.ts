import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetPayloadsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  matchId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  leagueId?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  teamId?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;


}

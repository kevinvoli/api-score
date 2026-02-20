import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class GetLiveRecommendationsQueryDto {
  @IsOptional()
  @IsUUID()
  fixtureId?: string;

  @IsOptional()
  @IsIn(['NEW', 'ACTIVE', 'REJECTED'])
  status?: 'NEW' | 'ACTIVE' | 'REJECTED';

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
}

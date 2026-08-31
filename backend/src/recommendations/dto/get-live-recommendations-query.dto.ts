import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class GetLiveRecommendationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  fixtureId?: string;

  @IsOptional()
  @IsIn(['NEW', 'ACTIVE', 'REJECTED'])
  status?: 'NEW' | 'ACTIVE' | 'REJECTED';
}

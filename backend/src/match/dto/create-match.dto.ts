import {
  IsInt,
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class StatisticDto {
  @IsString()
  type: string;

  @IsString()
  home: string;

  @IsString()
  away: string;
}

export class CreateMatchDto {
  @IsInt()
  id: number;

  @IsString()
  match_status: string;

  @IsString()
  match_hometeam_name: string;

  @IsString()
  match_awayteam_name: string;

  @IsString()
  match_hometeam_score: string;

  @IsString()
  match_awayteam_score: string;

  @IsDateString()
  match_date: string;

  @IsString()
  match_time: string;

  @IsString()
  league_id: string;

  @IsString()
  league_name: string;

  @IsString()
  country_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatisticDto)
  statistics: StatisticDto[];
}
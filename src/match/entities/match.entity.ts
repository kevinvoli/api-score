import {
  IsInt,
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class Statistic {
  @IsString()
  type: string;

  @IsString()
  home: string;

  @IsString()
  away: string;
}

export class Match {
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

  @IsString()
  match_date: string; // Could be IsDate if stored as Date object

  @IsString()
  match_time: string; // Could be IsDate if combined with match_date

  @IsString()
  league_id: string; // Assuming string based on example, could be number

  @IsString()
  league_name: string;

  @IsString()
  country_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Statistic)
  statistics: Statistic[];

  // Optional fields for predictions/coupons
  @IsOptional()
  @IsString()
  prediction?: string;
}
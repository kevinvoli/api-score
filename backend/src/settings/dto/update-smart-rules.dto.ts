import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class SmartRuleItemDto {
  @IsInt()
  @Min(1)
  @Max(90)
  minute: number;

  @IsInt()
  @Min(0)
  shotsThreshold: number;

  @IsNumber()
  @Min(1.01)
  @Max(50)
  odds: number;
}

export class UpdateSmartRulesDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmartRuleItemDto)
  firstHalfRules?: SmartRuleItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmartRuleItemDto)
  secondHalfRules?: SmartRuleItemDto[];
}

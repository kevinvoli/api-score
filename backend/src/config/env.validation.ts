import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @IsString()
  @IsNotEmpty()
  DB_URL: string;

  @IsString()
  @IsNotEmpty()
  API_FOOTBALL_BASE_URL: string;

  @IsString()
  @IsNotEmpty()
  API_FOOTBALL_KEY: string;

  @IsString()
  @IsNotEmpty()
  API_FOOTBALL_HOST: string;

  @IsInt()
  @Min(1000)
  @Max(120000)
  REQUEST_TIMEOUT_MS: number;

  @IsInt()
  @Min(0)
  @Max(10)
  RETRY_MAX: number;

  @IsInt()
  @Min(1)
  @Max(5000)
  RATE_LIMIT_PER_MIN: number;

  @IsIn(['true', 'false'])
  CORS_ENABLED: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsIn(['true', 'false'])
  LIVE_FIXTURES_SYNC_ENABLED: string;

  @IsInt()
  @Min(10000)
  @Max(300000)
  LIVE_FIXTURES_SYNC_INTERVAL_MS: number;

  @IsInt()
  @Min(10)
  @Max(100)
  SYNC_RATE_LIMIT_HEADROOM_PCT: number;

  @IsInt()
  @Min(0)
  @Max(300000)
  LIVE_READ_CACHE_TTL_MS: number;

  @IsString()
  @MinLength(16)
  API_KEY: string;

  @IsOptional()
  @IsIn(['apisports', 'apifootball'])
  API_FOOTBALL_VENDOR?: string = 'apisports';

  @IsOptional()
  @IsString()
  API_FOOTBALL_TIMEZONE?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  SCHEDULER_MAX_CONSECUTIVE_FAILURES?: number = 5;

  @IsOptional()
  @IsInt()
  @Min(60000)
  SCHEDULER_PAUSE_DURATION_MS?: number = 300000;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  ALERT_ERROR_RATE_PCT?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  ALERT_TIMEOUT_RATE_PCT?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  ALERT_QUOTA_REMAINING_MIN_PCT?: number = 10;

  @IsOptional()
  @IsUrl()
  SLACK_ALERT_WEBHOOK_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => {
        const constraints = error.constraints ? Object.values(error.constraints).join(', ') : 'invalid value';
        return `${error.property}: ${constraints}`;
      })
      .join('; ');

    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
}

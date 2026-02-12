import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
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

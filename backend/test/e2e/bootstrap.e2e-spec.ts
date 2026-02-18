/**
 * E1-T03 - Bootstrap e2e tests
 *
 * Validates application startup behaviour under various configuration conditions.
 * These tests do NOT require a live database or external provider.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../src/config/env.validation';

// ---------------------------------------------------------------------------
// Minimal valid environment used across all tests
// ---------------------------------------------------------------------------
const VALID_ENV: Record<string, string> = {
  PORT: '3010',
  NODE_ENV: 'test',
  DB_URL: 'mysql://user:pass@localhost:3306/api_score',
  API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
  API_FOOTBALL_KEY: 'test-api-key-12345',
  API_FOOTBALL_HOST: 'v3.football.api-sports.io',
  REQUEST_TIMEOUT_MS: '30000',
  RETRY_MAX: '3',
  RATE_LIMIT_PER_MIN: '300',
  CORS_ENABLED: 'false',
  LIVE_FIXTURES_SYNC_ENABLED: 'false',
  LIVE_FIXTURES_SYNC_INTERVAL_MS: '30000',
  SYNC_RATE_LIMIT_HEADROOM_PCT: '90',
  LIVE_READ_CACHE_TTL_MS: '30000',
};

// ---------------------------------------------------------------------------
// Scenario 1: valid env + config module boots without errors
// ---------------------------------------------------------------------------
describe('Bootstrap - Scenario 1: valid env loads cleanly', () => {
  let module: TestingModule;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    // Save current env and inject the valid test env into process.env
    // (NestJS ConfigModule.validate reads from process.env, not from load())
    savedEnv = {};
    for (const key of Object.keys(VALID_ENV)) {
      savedEnv[key] = process.env[key];
      process.env[key] = VALID_ENV[key];
    }
  });

  afterAll(() => {
    // Restore original env
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should compile ConfigModule with a complete and valid environment', async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: false,
          ignoreEnvFile: true,
          validate: validateEnv,
        }),
      ],
    }).compile();

    expect(module).toBeDefined();
  });

  it('should validate the env object and return typed config', () => {
    const result = validateEnv({ ...VALID_ENV });

    expect(result.PORT).toBe(3010);
    expect(result.NODE_ENV).toBe('test');
    expect(result.DB_URL).toBe('mysql://user:pass@localhost:3306/api_score');
    expect(result.API_FOOTBALL_KEY).toBe('test-api-key-12345');
    expect(result.LIVE_FIXTURES_SYNC_ENABLED).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: DB_URL absent → startup fails with explicit message
// ---------------------------------------------------------------------------
describe('Bootstrap - Scenario 2: DB_URL absent causes explicit failure', () => {
  it('should throw with message mentioning DB_URL when it is missing', () => {
    const envWithoutDbUrl = { ...VALID_ENV };
    delete envWithoutDbUrl['DB_URL'];

    expect(() => validateEnv(envWithoutDbUrl)).toThrow(/Environment validation failed/);
  });

  it('should throw with message mentioning DB_URL when it is empty', () => {
    expect(() => validateEnv({ ...VALID_ENV, DB_URL: '' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('should mention DB_URL in the error details', () => {
    const envWithoutDbUrl = { ...VALID_ENV };
    delete envWithoutDbUrl['DB_URL'];

    let thrownError: Error | null = null;
    try {
      validateEnv(envWithoutDbUrl);
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toMatch(/DB_URL/);
  });

  it('ConfigModule compilation should fail when DB_URL is absent', async () => {
    const envWithoutDbUrl = { ...VALID_ENV };
    delete envWithoutDbUrl['DB_URL'];

    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: false,
            ignoreEnvFile: true,
            load: [() => ({ ...envWithoutDbUrl })],
            validate: validateEnv,
          }),
        ],
      }).compile(),
    ).rejects.toThrow(/Environment validation failed/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: API_FOOTBALL_KEY absent → config validation fails
// ---------------------------------------------------------------------------
describe('Bootstrap - Scenario 3: API_FOOTBALL_KEY absent causes explicit failure', () => {
  it('should throw when API_FOOTBALL_KEY is missing', () => {
    const envWithoutKey = { ...VALID_ENV };
    delete envWithoutKey['API_FOOTBALL_KEY'];

    expect(() => validateEnv(envWithoutKey)).toThrow(/Environment validation failed/);
  });

  it('should mention API_FOOTBALL_KEY in the error details', () => {
    const envWithoutKey = { ...VALID_ENV };
    delete envWithoutKey['API_FOOTBALL_KEY'];

    let thrownError: Error | null = null;
    try {
      validateEnv(envWithoutKey);
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toMatch(/API_FOOTBALL_KEY/);
  });

  it('should throw when API_FOOTBALL_KEY is an empty string', () => {
    expect(() => validateEnv({ ...VALID_ENV, API_FOOTBALL_KEY: '' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('ConfigModule compilation should fail when API_FOOTBALL_KEY is absent', async () => {
    const envWithoutKey = { ...VALID_ENV };
    delete envWithoutKey['API_FOOTBALL_KEY'];

    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: false,
            ignoreEnvFile: true,
            load: [() => ({ ...envWithoutKey })],
            validate: validateEnv,
          }),
        ],
      }).compile(),
    ).rejects.toThrow(/Environment validation failed/);
  });
});

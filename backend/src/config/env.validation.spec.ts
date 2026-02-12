import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('should validate a correct environment', () => {
    const env = validateEnv({
      PORT: '3010',
      NODE_ENV: 'development',
      DB_URL: 'mysql://user:pass@localhost:3306/api_score',
      API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
      API_FOOTBALL_KEY: 'test-key',
      API_FOOTBALL_HOST: 'v3.football.api-sports.io',
      REQUEST_TIMEOUT_MS: '30000',
      RETRY_MAX: '3',
      RATE_LIMIT_PER_MIN: '300',
      CORS_ENABLED: 'true',
      CORS_ORIGIN: '*',
      LIVE_FIXTURES_SYNC_ENABLED: 'true',
      LIVE_FIXTURES_SYNC_INTERVAL_MS: '30000',
      SYNC_RATE_LIMIT_HEADROOM_PCT: '90',
      LIVE_READ_CACHE_TTL_MS: '30000',
    });

    expect(env.PORT).toBe(3010);
    expect(env.NODE_ENV).toBe('development');
    expect(env.RETRY_MAX).toBe(3);
  });

  it('should throw on missing required vars', () => {
    expect(() => validateEnv({ PORT: '3010' })).toThrow(
      'Environment validation failed',
    );
  });

  it('should throw on invalid values', () => {
    expect(() =>
      validateEnv({
        PORT: '99999',
        NODE_ENV: 'staging',
        DB_URL: '',
        API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
        API_FOOTBALL_KEY: 'test-key',
        API_FOOTBALL_HOST: 'v3.football.api-sports.io',
        REQUEST_TIMEOUT_MS: '10',
        RETRY_MAX: '99',
        RATE_LIMIT_PER_MIN: '0',
        CORS_ENABLED: 'maybe',
        LIVE_FIXTURES_SYNC_ENABLED: 'enabled',
        LIVE_FIXTURES_SYNC_INTERVAL_MS: '500',
        SYNC_RATE_LIMIT_HEADROOM_PCT: '200',
        LIVE_READ_CACHE_TTL_MS: '-1',
      }),
    ).toThrow('Environment validation failed');
  });
});


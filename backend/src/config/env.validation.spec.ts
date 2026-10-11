import { validateEnv } from './env.validation';

const validEnvironment: Record<string, unknown> = {
  PORT: '3010',
  NODE_ENV: 'test',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'api_score_app',
  MYSQL_PASSWORD: 'secret',
  MYSQL_DATABASE: 'api_score',
  API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
  API_FOOTBALL_KEY: 'provider-key',
  API_FOOTBALL_HOST: 'v3.football.api-sports.io',
  REQUEST_TIMEOUT_MS: '30000',
  RETRY_MAX: '3',
  RATE_LIMIT_PER_MIN: '300',
  CORS_ENABLED: 'true',
  LIVE_FIXTURES_SYNC_ENABLED: 'false',
  LIVE_FIXTURES_SYNC_INTERVAL_MS: '30000',
  SYNC_RATE_LIMIT_HEADROOM_PCT: '90',
  LIVE_READ_CACHE_TTL_MS: '30000',
  API_KEY: '0123456789abcdef',
};

describe('validateEnv', () => {
  it('convertit MYSQL_PORT en nombre', () => {
    const result = validateEnv(validEnvironment);

    expect(result.MYSQL_PORT).toBe(3306);
    expect(typeof result.MYSQL_PORT).toBe('number');
  });

  it.each(['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_DATABASE'])(
    'refuse la variable obligatoire absente %s',
    (variableName) => {
      const environment = { ...validEnvironment };
      delete environment[variableName];

      expect(() => validateEnv(environment)).toThrow(variableName);
    },
  );

  it('accepte MYSQL_PASSWORD absent (base locale sans mot de passe)', () => {
    const environment = { ...validEnvironment };
    delete environment.MYSQL_PASSWORD;

    expect(validateEnv(environment).MYSQL_PASSWORD).toBeUndefined();
  });

  it('accepte MYSQL_PASSWORD vide', () => {
    expect(
      validateEnv({ ...validEnvironment, MYSQL_PASSWORD: '' }).MYSQL_PASSWORD,
    ).toBe('');
  });

  it('conserve MYSQL_PASSWORD renseigné', () => {
    expect(validateEnv(validEnvironment).MYSQL_PASSWORD).toBe('secret');
  });

  it.each(['0', '65536', '3306.5', 'invalid'])(
    'refuse le port MySQL invalide %s',
    (mysqlPort) => {
      expect(() =>
        validateEnv({ ...validEnvironment, MYSQL_PORT: mysqlPort }),
      ).toThrow('MYSQL_PORT');
    },
  );

  it.each([
    ['MYSQL_HOST', ''],
    ['MYSQL_USER', ''],
    ['MYSQL_PASSWORD', '   '],
    ['MYSQL_DATABASE', ''],
  ])('refuse la variable vide %s', (variableName, value) => {
    expect(() =>
      validateEnv({ ...validEnvironment, [variableName]: value }),
    ).toThrow(variableName);
  });

  it('REAL_MONEY_INTERLOCK est fermé par défaut', () => {
    expect(validateEnv(validEnvironment).REAL_MONEY_INTERLOCK).toBe('false');
  });

  it.each(['TRUE', '1', 'yes', ''])(
    'refuse une valeur ambiguë de REAL_MONEY_INTERLOCK (%p) : démarrage bloqué',
    (value) => {
      expect(() =>
        validateEnv({ ...validEnvironment, REAL_MONEY_INTERLOCK: value }),
      ).toThrow('REAL_MONEY_INTERLOCK');
    },
  );

  it('réconciliation périodique désactivée par défaut, intervalle ≥ 60 s', () => {
    expect(validateEnv(validEnvironment)).toMatchObject({
      RECONCILIATION_SCHEDULER_ENABLED: 'false',
      RECONCILIATION_INTERVAL_MS: 300000,
    });
    expect(() =>
      validateEnv({ ...validEnvironment, RECONCILIATION_INTERVAL_MS: '1000' }),
    ).toThrow('RECONCILIATION_INTERVAL_MS');
    expect(() =>
      validateEnv({
        ...validEnvironment,
        RECONCILIATION_SCHEDULER_ENABLED: 'oui',
      }),
    ).toThrow('RECONCILIATION_SCHEDULER_ENABLED');
  });
});

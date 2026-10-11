import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { AuthLoginAttempt } from '../database/entities/auth-login-attempt.entity';
import { AuthSession } from '../database/entities/auth-session.entity';
import { AuthUser } from '../database/entities/auth-user.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { CreateAuthentication20261002090000 } from '../database/migrations/20261002090000-create-authentication';
import { AuthService } from './auth.service';
import { UserRole } from './auth.types';

const databaseUrl = process.env.AUTH_MYSQL_INTEGRATION_DB_URL;
const describeWithMysql = databaseUrl ? describe : describe.skip;
const destructiveOptIn = 'api-score-auth-it';
const ephemeralDatabaseName = 'api_score_auth_it';

type ColumnMetadata = {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  DATETIME_PRECISION: number | null;
};

type ForeignKeyMetadata = {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  DELETE_RULE: string;
  UPDATE_RULE: string;
};

type CountRow = { count: string };
type DatabaseRow = { databaseName: string };

function assertDestructiveTarget(
  optIn: string | undefined,
  configuredDatabase: string,
  selectedDatabase: string | undefined,
): void {
  if (optIn !== destructiveOptIn) {
    throw new Error(
      `Refus d'opération destructive sans AUTH_MYSQL_INTEGRATION_DESTRUCTIVE=${destructiveOptIn}`,
    );
  }

  if (
    configuredDatabase !== ephemeralDatabaseName ||
    selectedDatabase !== ephemeralDatabaseName
  ) {
    throw new Error(
      `Refus d'opération destructive hors de la base éphémère ${ephemeralDatabaseName}`,
    );
  }
}

async function rows<T>(
  dataSource: DataSource,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  return (await dataSource.query(sql, [...parameters])) as T[];
}

function createDataSource(url: string): DataSource {
  return new DataSource({
    type: 'mysql',
    url,
    entities: [AuthUser, AuthSession, AuthLoginAttempt, OperationAuditEvent],
    migrations: [CreateAuthentication20261002090000],
    synchronize: false,
    logging: false,
  });
}

async function assertEphemeralDatabase(dataSource: DataSource): Promise<void> {
  const configuredDatabase = new URL(databaseUrl as string).pathname.slice(1);
  const [selectedDatabase] = await rows<DatabaseRow>(
    dataSource,
    'SELECT DATABASE() AS databaseName',
  );
  assertDestructiveTarget(
    process.env.AUTH_MYSQL_INTEGRATION_DESTRUCTIVE,
    configuredDatabase,
    selectedDatabase?.databaseName,
  );
}

function createAuthService(dataSource: DataSource): AuthService {
  return new AuthService(
    dataSource.getRepository(AuthUser),
    dataSource.getRepository(AuthSession),
    dataSource.getRepository(OperationAuditEvent),
    dataSource,
    new ConfigService({
      AUTH_SESSION_TTL_SECONDS: 28_800,
      AUTH_LOGIN_MAX_ATTEMPTS: 3,
      AUTH_LOGIN_WINDOW_SECONDS: 900,
    }),
    new AsyncContextService(),
  );
}

async function clearAuthData(dataSource: DataSource): Promise<void> {
  await assertEphemeralDatabase(dataSource);
  await dataSource.query('DELETE FROM operation_audit_events');
  await dataSource.query('DELETE FROM auth_sessions');
  await dataSource.query('DELETE FROM auth_login_attempts');
  await dataSource.query('DELETE FROM auth_users');
}

describeWithMysql('Authentification avec MySQL 8.4', () => {
  let firstDataSource: DataSource;
  let secondDataSource: DataSource;

  beforeAll(async () => {
    firstDataSource = createDataSource(databaseUrl as string);
    await firstDataSource.initialize();
  });

  afterAll(async () => {
    if (secondDataSource?.isInitialized) await secondDataSource.destroy();
    if (firstDataSource?.isInitialized) await firstDataSource.destroy();
  });

  it('applique la migration, respecte le schéma attendu, puis supporte down et up', async () => {
    await firstDataSource.runMigrations({ transaction: 'none' });

    const columns = await rows<ColumnMetadata>(
      firstDataSource,
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, CHARACTER_SET_NAME,
              COLLATION_NAME, DATETIME_PRECISION
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'auth_users', 'auth_sessions', 'auth_login_attempts',
            'operation_audit_events'
          )`,
    );
    const byName = new Map(
      columns.map((column) => [
        `${column.COLUMN_NAME}:${column.DATA_TYPE}`,
        column,
      ]),
    );

    expect(columns).toHaveLength(25);
    expect(byName.get('email:varchar')).toMatchObject({
      CHARACTER_SET_NAME: 'utf8mb4',
      COLLATION_NAME: 'utf8mb4_bin',
    });
    expect(byName.get('token_hash:char')).toMatchObject({
      CHARACTER_SET_NAME: 'ascii',
      COLLATION_NAME: 'ascii_bin',
    });
    expect(byName.get('identifier_hash:char')).toMatchObject({
      CHARACTER_SET_NAME: 'ascii',
      COLLATION_NAME: 'ascii_bin',
    });
    expect(byName.get('role:enum')?.COLUMN_TYPE).toBe(
      "enum('VIEWER','OPERATOR','ADMIN')",
    );
    for (const column of columns.filter(
      (candidate) => candidate.DATA_TYPE === 'datetime',
    )) {
      expect(column.DATETIME_PRECISION).toBe(6);
    }

    const foreignKeys = await rows<ForeignKeyMetadata>(
      firstDataSource,
      `SELECT k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME,
              k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
              r.DELETE_RULE, r.UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        WHERE k.CONSTRAINT_SCHEMA = DATABASE()
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
          AND k.TABLE_NAME IN ('auth_sessions', 'operation_audit_events')
        ORDER BY k.TABLE_NAME`,
    );
    expect(foreignKeys).toEqual([
      expect.objectContaining({
        TABLE_NAME: 'auth_sessions',
        COLUMN_NAME: 'user_id',
        REFERENCED_TABLE_NAME: 'auth_users',
        REFERENCED_COLUMN_NAME: 'id',
        DELETE_RULE: 'RESTRICT',
        UPDATE_RULE: 'RESTRICT',
      }),
      expect.objectContaining({
        TABLE_NAME: 'operation_audit_events',
        COLUMN_NAME: 'actor_user_id',
        REFERENCED_TABLE_NAME: 'auth_users',
        REFERENCED_COLUMN_NAME: 'id',
        DELETE_RULE: 'SET NULL',
        UPDATE_RULE: 'RESTRICT',
      }),
    ]);

    expect(() =>
      assertDestructiveTarget(
        undefined,
        ephemeralDatabaseName,
        ephemeralDatabaseName,
      ),
    ).toThrow("Refus d'opération destructive sans");
    expect(() =>
      assertDestructiveTarget(
        destructiveOptIn,
        'api_score',
        ephemeralDatabaseName,
      ),
    ).toThrow("Refus d'opération destructive hors de la base éphémère");
    expect(() =>
      assertDestructiveTarget(
        destructiveOptIn,
        ephemeralDatabaseName,
        'api_score',
      ),
    ).toThrow("Refus d'opération destructive hors de la base éphémère");
    expect(() =>
      assertDestructiveTarget(
        destructiveOptIn,
        ephemeralDatabaseName,
        ephemeralDatabaseName,
      ),
    ).not.toThrow();

    await expect(assertEphemeralDatabase(firstDataSource)).resolves.toBe(
      undefined,
    );

    await assertEphemeralDatabase(firstDataSource);
    await firstDataSource.undoLastMigration({ transaction: 'none' });
    const tablesAfterDown = await rows<{ TABLE_NAME: string }>(
      firstDataSource,
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'auth_users', 'auth_sessions', 'auth_login_attempts',
            'operation_audit_events'
          )`,
    );
    expect(tablesAfterDown).toEqual([]);

    await firstDataSource.runMigrations({ transaction: 'none' });
    secondDataSource = createDataSource(databaseUrl as string);
    await secondDataSource.initialize();
  });

  describe('concurrence réelle entre deux pools TypeORM', () => {
    beforeEach(async () => {
      await clearAuthData(firstDataSource);
    });

    it('ne conserve exactement qu’une session active lors de deux connexions simultanées', async () => {
      const password = 'Integration-password-1!';
      await firstDataSource.getRepository(AuthUser).save({
        email: 'operator@example.com',
        passwordHash: await argon2.hash(password),
        role: UserRole.OPERATOR,
        disabledAt: null,
      });
      const firstService = createAuthService(firstDataSource);
      const secondService = createAuthService(secondDataSource);

      const [firstLogin, secondLogin] = await Promise.all([
        firstService.login({ email: 'operator@example.com', password }),
        secondService.login({ email: ' OPERATOR@example.com ', password }),
      ]);

      expect(firstLogin.sessionToken).not.toBe(secondLogin.sessionToken);
      const activeSessions = await rows<CountRow>(
        firstDataSource,
        `SELECT COUNT(*) AS count
           FROM auth_sessions
          WHERE revoked_at IS NULL AND expires_at > NOW(6)`,
      );
      const allSessions = await rows<CountRow>(
        firstDataSource,
        'SELECT COUNT(*) AS count FROM auth_sessions',
      );
      expect(Number(activeSessions[0].count)).toBe(1);
      expect(Number(allSessions[0].count)).toBe(2);
    });

    it('borne atomiquement les échecs d’un compte inexistant sous ses variantes canoniques', async () => {
      const firstService = createAuthService(firstDataSource);
      const secondService = createAuthService(secondDataSource);
      const variants = [
        'missing@example.com',
        ' MISSING@example.com ',
        'Missing@Example.Com',
        'missing@EXAMPLE.com',
        '  missing@example.com  ',
      ];

      const results = await Promise.allSettled(
        variants.map((email, index) =>
          (index % 2 === 0 ? firstService : secondService).login({
            email,
            password: 'wrong-password',
          }),
        ),
      );

      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(variants.length);
      const attempts = await firstDataSource
        .getRepository(AuthLoginAttempt)
        .find();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].failedCount).toBe(3);

      const failedAudits = await rows<CountRow>(
        firstDataSource,
        `SELECT COUNT(*) AS count
           FROM operation_audit_events
          WHERE action = 'AUTH_LOGIN_FAILED'`,
      );
      const rateLimitedAudits = await rows<CountRow>(
        firstDataSource,
        `SELECT COUNT(*) AS count
           FROM operation_audit_events
          WHERE action = 'AUTH_LOGIN_RATE_LIMITED'`,
      );
      expect(Number(failedAudits[0].count)).toBe(3);
      expect(Number(rateLimitedAudits[0].count)).toBe(2);
    });
  });
});

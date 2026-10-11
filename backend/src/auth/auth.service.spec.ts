import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import {
  DataSource,
  EntityManager,
  FindOperator,
  Repository,
  UpdateResult,
} from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { JsonLogger } from '../common/json.logger';
import { AuthSession } from '../database/entities/auth-session.entity';
import { AuthLoginAttempt } from '../database/entities/auth-login-attempt.entity';
import { AuthUser } from '../database/entities/auth-user.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { AuthService } from './auth.service';
import { UserRole } from './auth.types';

const VALID_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$BFND80zyePRC307tzXN/mw$+iqr0NSGBUcUfoW5BYki9gMb1KMxxZPjytwktUNjjQk';

interface QueryBuilderMock<T> {
  addSelect: jest.Mock;
  setLock: jest.Mock;
  innerJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getOne: jest.MockedFunction<() => Promise<T | null>>;
  getOneOrFail: jest.MockedFunction<() => Promise<T>>;
  getCount: jest.MockedFunction<() => Promise<number>>;
}

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;
  queryBuilder.addSelect = jest.fn(() => queryBuilder);
  queryBuilder.setLock = jest.fn(() => queryBuilder);
  queryBuilder.innerJoinAndSelect = jest.fn(() => queryBuilder);
  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.andWhere = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn();
  queryBuilder.getOneOrFail = jest.fn();
  queryBuilder.getCount = jest.fn();
  return queryBuilder;
}

interface FakeAuthSessionRow {
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  userDisabledAt: Date | null;
}

/**
 * Query builder qui dérive réellement le résultat de getOne() des prédicats
 * (where/andWhere) effectivement posés par AuthService.resolveSession, au lieu
 * de forcer la réponse via mockResolvedValue. Permet de distinguer une session
 * expirée (mais non révoquée) d'une session révoquée (mais non expirée).
 */
function createEvaluableSessionQueryBuilder(
  row: FakeAuthSessionRow,
): QueryBuilderMock<AuthSession> {
  const queryBuilder = createQueryBuilderMock<AuthSession>();
  const conditions: Array<() => boolean> = [];

  const register = (sql: string, params?: Record<string, unknown>): void => {
    if (sql === 'session.tokenHash = :tokenHash') {
      conditions.push(() => row.tokenHash === params?.tokenHash);
    } else if (sql === 'session.revokedAt IS NULL') {
      conditions.push(() => row.revokedAt === null);
    } else if (sql === 'session.expiresAt > :now') {
      const now = params?.now as Date;
      conditions.push(() => row.expiresAt.getTime() > now.getTime());
    } else if (sql === 'user.disabledAt IS NULL') {
      conditions.push(() => row.userDisabledAt === null);
    }
  };

  queryBuilder.where = jest.fn(
    (sql: string, params?: Record<string, unknown>) => {
      register(sql, params);
      return queryBuilder;
    },
  );
  queryBuilder.andWhere = jest.fn(
    (sql: string, params?: Record<string, unknown>) => {
      register(sql, params);
      return queryBuilder;
    },
  );
  queryBuilder.getOne = jest.fn(async () => {
    const matches = conditions.every((condition) => condition());
    if (!matches) return null;
    return {
      id: 'session-x',
      userId: 'user-1',
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: new Date(),
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      } as AuthUser,
    } as AuthSession;
  });
  return queryBuilder;
}

interface FakeActiveSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

function isFindOperatorIsNull(value: unknown): boolean {
  return value instanceof FindOperator && value.type === 'isNull';
}

function isFindOperatorMoreThan(value: unknown): value is FindOperator<Date> {
  return value instanceof FindOperator && value.type === 'moreThan';
}

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let sessionRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let auditRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let attemptRepository: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let userQueryBuilder: QueryBuilderMock<AuthUser>;
  let auditQueryBuilder: QueryBuilderMock<OperationAuditEvent>;
  let sessionQueryBuilder: QueryBuilderMock<AuthSession>;
  let attemptQueryBuilder: QueryBuilderMock<AuthLoginAttempt>;
  let sessionSequence: number;
  let dataSource: { transaction: jest.Mock };

  const activeUser: AuthUser = {
    id: 'user-1',
    email: 'admin@example.com',
    passwordHash: VALID_PASSWORD_HASH,
    role: UserRole.ADMIN,
    disabledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionSequence = 0;
    userQueryBuilder = createQueryBuilderMock<AuthUser>();
    auditQueryBuilder = createQueryBuilderMock<OperationAuditEvent>();
    sessionQueryBuilder = createQueryBuilderMock<AuthSession>();
    attemptQueryBuilder = createQueryBuilderMock<AuthLoginAttempt>();
    attemptQueryBuilder.getOneOrFail.mockResolvedValue({
      identifierHash: 'identifier-hash',
      failedCount: 0,
      windowStartedAt: new Date(),
      updatedAt: new Date(),
    });
    auditQueryBuilder.getCount.mockResolvedValue(0);
    userQueryBuilder.getOne.mockResolvedValue(activeUser);

    userRepository = {
      createQueryBuilder: jest.fn(() => userQueryBuilder),
      create: jest.fn((value: Partial<AuthUser>) => value as AuthUser),
      save: jest.fn(async (value: AuthUser) => value),
      findOne: jest.fn(),
    };
    sessionRepository = {
      createQueryBuilder: jest.fn(() => sessionQueryBuilder),
      create: jest.fn((value: Partial<AuthSession>) => value as AuthSession),
      save: jest.fn(async (value: AuthSession) => ({
        ...value,
        id: value.id ?? `session-${++sessionSequence}`,
      })),
      update: jest.fn(async () => ({ affected: 1 }) as UpdateResult),
    };
    auditRepository = {
      createQueryBuilder: jest.fn(() => auditQueryBuilder),
      create: jest.fn(
        (value: Partial<OperationAuditEvent>) => value as OperationAuditEvent,
      ),
      save: jest.fn(async (value: OperationAuditEvent) => value),
    };
    attemptRepository = {
      createQueryBuilder: jest.fn(() => attemptQueryBuilder),
      save: jest.fn(async (value: AuthLoginAttempt) => value),
      delete: jest.fn(async () => ({ affected: 1 })),
    };

    const manager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: object) => {
        if (entity === AuthUser) return userRepository;
        if (entity === AuthSession) return sessionRepository;
        if (entity === AuthLoginAttempt) return attemptRepository;
        return auditRepository;
      }),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(
        async (
          _isolation: string,
          callback: (entityManager: EntityManager) => Promise<unknown>,
        ) => callback(manager),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(AuthUser),
          useValue: userRepository as unknown as Repository<AuthUser>,
        },
        {
          provide: getRepositoryToken(AuthSession),
          useValue: sessionRepository as unknown as Repository<AuthSession>,
        },
        {
          provide: getRepositoryToken(OperationAuditEvent),
          useValue:
            auditRepository as unknown as Repository<OperationAuditEvent>,
        },
        {
          provide: getRepositoryToken(AuthLoginAttempt),
          useValue:
            attemptRepository as unknown as Repository<AuthLoginAttempt>,
        },
        { provide: DataSource, useValue: dataSource as unknown as DataSource },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
          },
        },
        {
          provide: AsyncContextService,
          useValue: { getTraceId: jest.fn(() => 'trace-1') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('refuse un mot de passe invalide et audite sans stocker le secret', async () => {
    await expect(
      service.login({
        email: ' ADMIN@Example.com ',
        password: 'incorrect-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'AUTH_LOGIN_IDENTIFIER',
        targetId: expect.stringMatching(/^[a-f0-9]{64}$/),
        metadata: { reason: 'INVALID' },
      }),
    );
    expect(JSON.stringify(auditRepository.save.mock.calls)).not.toContain(
      'incorrect-password',
    );
  });

  it('refuse un compte désactivé', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      ...activeUser,
      disabledAt: new Date(),
    });

    await expect(
      service.login({
        email: activeUser.email,
        password: 'correct-password-123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('borne les tentatives dans une fenêtre persistée', async () => {
    attemptQueryBuilder.getOneOrFail.mockResolvedValue({
      identifierHash: 'identifier-hash',
      failedCount: 5,
      windowStartedAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.login({
        email: activeUser.email,
        password: 'correct-password-123',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(userQueryBuilder.getOne).not.toHaveBeenCalled();
  });

  it('ne conserve qu’une session active après deux connexions concurrentes', async () => {
    const fakeSessions: FakeActiveSessionRow[] = [];
    let sequence = 0;
    let transactionTail = Promise.resolve();
    const baseTransaction = dataSource.transaction.getMockImplementation();
    dataSource.transaction.mockImplementation(
      async (
        isolation: string,
        callback: (manager: EntityManager) => Promise<unknown>,
      ) => {
        const previous = transactionTail;
        let release: () => void = () => undefined;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await baseTransaction?.(isolation, callback);
        } finally {
          release();
        }
      },
    );
    sessionRepository.save = jest.fn(async (value: Partial<AuthSession>) => {
      const row: FakeActiveSessionRow = {
        id: `session-${++sequence}`,
        userId: value.userId as string,
        tokenHash: value.tokenHash as string,
        revokedAt: (value.revokedAt as Date | null) ?? null,
        expiresAt: value.expiresAt as Date,
      };
      fakeSessions.push(row);
      return row as AuthSession;
    });
    sessionRepository.update = jest.fn(
      async (
        criteria: { userId?: string; revokedAt?: unknown; expiresAt?: unknown },
        patch: Partial<AuthSession>,
      ) => {
        const matched = fakeSessions.filter(
          (row) =>
            row.userId === criteria.userId &&
            (!isFindOperatorIsNull(criteria.revokedAt) ||
              row.revokedAt === null) &&
            (!isFindOperatorMoreThan(criteria.expiresAt) ||
              row.expiresAt.getTime() > criteria.expiresAt.value.getTime()),
        );
        matched.forEach((row) => {
          row.revokedAt = patch.revokedAt as Date;
        });
        return { affected: matched.length } as UpdateResult;
      },
    );

    const [first, second] = await Promise.all([
      service.login({
        email: activeUser.email,
        password: 'correct-password-123',
      }),
      service.login({
        email: activeUser.email,
        password: 'correct-password-123',
      }),
    ]);

    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(userQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(
      fakeSessions.filter((session) => session.revokedAt === null),
    ).toHaveLength(1);
  });

  it('sérialise les échecs concurrents et ne dépasse jamais la limite', async () => {
    userQueryBuilder.getOne.mockResolvedValue(null);
    const persistedAttempt: AuthLoginAttempt = {
      identifierHash: 'identifier-hash',
      failedCount: 0,
      windowStartedAt: new Date(),
      updatedAt: new Date(),
    };
    attemptQueryBuilder.getOneOrFail.mockImplementation(
      async () => persistedAttempt,
    );
    attemptRepository.save.mockImplementation(
      async (value: AuthLoginAttempt) => {
        persistedAttempt.failedCount = value.failedCount;
        persistedAttempt.windowStartedAt = value.windowStartedAt;
        return persistedAttempt;
      },
    );
    let transactionTail = Promise.resolve();
    const baseTransaction = dataSource.transaction.getMockImplementation();
    dataSource.transaction.mockImplementation(
      async (
        isolation: string,
        callback: (manager: EntityManager) => Promise<unknown>,
      ) => {
        const previous = transactionTail;
        let release: () => void = () => undefined;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await baseTransaction?.(isolation, callback);
        } finally {
          release();
        }
      },
    );

    const results = await Promise.allSettled(
      Array.from({ length: 7 }, (_, index) =>
        service.login({
          email:
            index % 2 === 0
              ? ' ADMIN@Example.com '
              : 'ＡＤＭＩＮ＠Ｅxample.com',
          password: 'incorrect-password',
        }),
      ),
    );

    expect(results).toHaveLength(7);
    expect(persistedAttempt.failedCount).toBe(5);
    expect(
      auditRepository.save.mock.calls.filter(
        ([event]) => event.action === 'AUTH_LOGIN_FAILED',
      ),
    ).toHaveLength(5);
    expect(
      auditRepository.save.mock.calls.filter(
        ([event]) => event.action === 'AUTH_LOGIN_RATE_LIMITED',
      ),
    ).toHaveLength(2);
    expect(
      new Set(auditRepository.save.mock.calls.map(([event]) => event.targetId)),
    ).toHaveProperty('size', 1);
  });

  it('révoque la session active précédente à la connexion suivante du même utilisateur (rotation, pas de session multiple)', async () => {
    const fakeSessions: FakeActiveSessionRow[] = [];
    let sequence = 0;

    sessionRepository.save = jest.fn(async (value: Partial<AuthSession>) => {
      const row: FakeActiveSessionRow = {
        id: `session-${++sequence}`,
        userId: value.userId as string,
        tokenHash: value.tokenHash as string,
        revokedAt: (value.revokedAt as Date | null) ?? null,
        expiresAt: value.expiresAt as Date,
      };
      fakeSessions.push(row);
      return row as AuthSession;
    });
    sessionRepository.update = jest.fn(
      async (
        criteria: {
          id?: string;
          userId?: string;
          revokedAt?: unknown;
          expiresAt?: unknown;
        },
        patch: Partial<AuthSession>,
      ) => {
        const matched = fakeSessions.filter((row) => {
          if (criteria.id !== undefined && row.id !== criteria.id) return false;
          if (criteria.userId !== undefined && row.userId !== criteria.userId)
            return false;
          if (
            isFindOperatorIsNull(criteria.revokedAt) &&
            row.revokedAt !== null
          )
            return false;
          if (
            isFindOperatorMoreThan(criteria.expiresAt) &&
            !(row.expiresAt.getTime() > criteria.expiresAt.value.getTime())
          )
            return false;
          return true;
        });
        matched.forEach((row) => {
          row.revokedAt = (patch.revokedAt as Date) ?? row.revokedAt;
        });
        return { affected: matched.length } as UpdateResult;
      },
    );

    const first = await service.login({
      email: activeUser.email,
      password: 'correct-password-123',
    });
    const second = await service.login({
      email: activeUser.email,
      password: 'correct-password-123',
    });

    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(fakeSessions).toHaveLength(2);
    expect(fakeSessions[0].revokedAt).not.toBeNull();
    expect(fakeSessions[1].revokedAt).toBeNull();
  });

  it('ne renvoie aucun hash de mot de passe ou de session', async () => {
    const response = await service.login({
      email: activeUser.email,
      password: 'correct-password-123',
    });
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('tokenHash');
    expect(response.user).toEqual({
      id: activeUser.id,
      email: activeUser.email,
      role: UserRole.ADMIN,
    });
    expect(attemptRepository.delete).toHaveBeenCalledTimes(1);
  });

  it('ne journalise jamais le mot de passe ni le token de session en clair pendant une connexion', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await service.login({
      email: activeUser.email,
      password: 'correct-password-123',
    });

    const loggedOutput = [
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ]
      .map((call) => call.map((arg) => String(arg)).join(' '))
      .join('\n');

    expect(loggedOutput).not.toContain(response.sessionToken);
    expect(loggedOutput).not.toContain('correct-password-123');

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('résout une session active et son utilisateur en une requête', async () => {
    sessionQueryBuilder.getOne.mockResolvedValue({
      id: 'session-1',
      userId: activeUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user: activeUser,
    });

    await expect(service.resolveSession('a'.repeat(43))).resolves.toEqual({
      sessionId: 'session-1',
      id: activeUser.id,
      email: activeUser.email,
      role: UserRole.ADMIN,
    });
    expect(sessionQueryBuilder.innerJoinAndSelect).toHaveBeenCalledTimes(1);
    expect(sessionQueryBuilder.getOne).toHaveBeenCalledTimes(1);
  });

  it('refuse une session expirée ou révoquée', async () => {
    sessionQueryBuilder.getOne.mockResolvedValue(null);

    await expect(service.resolveSession('a'.repeat(43))).resolves.toBeNull();
    expect(sessionQueryBuilder.andWhere).toHaveBeenCalledWith(
      'session.revokedAt IS NULL',
    );
    expect(sessionQueryBuilder.andWhere).toHaveBeenCalledWith(
      'session.expiresAt > :now',
      expect.objectContaining({ now: expect.any(Date) }),
    );
  });

  it('refuse une session expirée même si elle n’a jamais été révoquée', async () => {
    const token = 'd'.repeat(43);
    const expiredRow: FakeAuthSessionRow = {
      tokenHash: 'any-hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      userDisabledAt: null,
    };
    sessionRepository.createQueryBuilder = jest.fn(() => {
      const queryBuilder = createEvaluableSessionQueryBuilder(expiredRow);
      const originalWhere = queryBuilder.where as jest.Mock;
      originalWhere.mockImplementation(
        (_sql: string, params?: Record<string, unknown>) => {
          expiredRow.tokenHash = String(params?.tokenHash);
          return queryBuilder;
        },
      );
      return queryBuilder;
    });

    await expect(service.resolveSession(token)).resolves.toBeNull();
  });

  it('refuse une session révoquée même si elle n’a pas encore expiré', async () => {
    const token = 'e'.repeat(43);
    const revokedRow: FakeAuthSessionRow = {
      tokenHash: 'any-hash',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      userDisabledAt: null,
    };
    sessionRepository.createQueryBuilder = jest.fn(() => {
      const queryBuilder = createEvaluableSessionQueryBuilder(revokedRow);
      const originalWhere = queryBuilder.where as jest.Mock;
      originalWhere.mockImplementation(
        (_sql: string, params?: Record<string, unknown>) => {
          revokedRow.tokenHash = String(params?.tokenHash);
          return queryBuilder;
        },
      );
      return queryBuilder;
    });

    await expect(service.resolveSession(token)).resolves.toBeNull();
  });

  it('rend le logout rejouable sans dupliquer son audit', async () => {
    sessionRepository.update
      .mockResolvedValueOnce({ affected: 1 } as UpdateResult)
      .mockResolvedValueOnce({ affected: 0 } as UpdateResult);

    await service.logout('session-1', activeUser.id);
    await service.logout('session-1', activeUser.id);

    expect(auditRepository.save).toHaveBeenCalledTimes(1);
  });

  it('expurge les hashes sensibles des logs structurés', () => {
    const output = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const logger = new JsonLogger({
      getTraceId: () => 'trace-1',
    } as AsyncContextService);

    logger.log({
      passwordHash: 'password-secret',
      sessionTokenHash: 'session-secret',
    });

    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0][0]).not.toContain('password-secret');
    expect(output.mock.calls[0][0]).not.toContain('session-secret');
    output.mockRestore();
  });
});

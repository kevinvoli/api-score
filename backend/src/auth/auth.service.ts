import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  MoreThan,
  Repository,
} from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { AuthSession } from '../database/entities/auth-session.entity';
import { AuthLoginAttempt } from '../database/entities/auth-login-attempt.entity';
import { AuthUser } from '../database/entities/auth-user.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { LoginDto } from './dto/login.dto';
import { normalizeAuthEmail } from './auth-email';
import {
  AuthenticatedPrincipal,
  AuthUserResponse,
  LoginResponse,
  UserRole,
} from './auth.types';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$eC0w+UvTcm62T+RRtGumvg$sdlgC/4++UPzEeKA0Ri6zA6ge+Owvw5B3zh4ohXOUb4';

const PASSWORD_HASH_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

type LoginTransactionResult =
  | { status: 'SUCCESS'; response: LoginResponse }
  | { status: 'INVALID' | 'DISABLED' | 'RATE_LIMITED' };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthUser)
    private readonly userRepository: Repository<AuthUser>,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    @InjectRepository(OperationAuditEvent)
    private readonly auditRepository: Repository<OperationAuditEvent>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly asyncContextService: AsyncContextService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const email = normalizeAuthEmail(dto.email);
    const result = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => this.loginInTransaction(manager, email, dto.password),
    );
    console.log('Login result:', result); // Log the result for debugging
    if (result.status === 'RATE_LIMITED') {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.status !== 'SUCCESS') {
      throw new UnauthorizedException('Invalid credentials');
    }
    return result.response;
  }

  async resolveSession(
    sessionToken: string,
  ): Promise<AuthenticatedPrincipal | null> {
    const tokenHash = this.hashSessionToken(sessionToken);
    const session = await this.sessionRepository
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.user', 'user')
      .where('session.tokenHash = :tokenHash', { tokenHash })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now: new Date() })
      .andWhere('user.disabledAt IS NULL')
      .getOne();

    if (!session?.user) return null;

    return {
      sessionId: session.id,
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
  }

  /**
   * Révocation idempotente par jeton porteur, utilisée par la route de
   * logout qui ne passe plus par une session résolue (B4) : un jeton
   * absent, syntaxiquement invalide, déjà révoqué ou inconnu ne déclenche
   * ni erreur ni audit.
   */
  async revokeSessionByToken(sessionToken: string | null): Promise<void> {
    if (!sessionToken) return;

    const tokenHash = this.hashSessionToken(sessionToken);
    const session = await this.sessionRepository.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    if (!session) return;

    await this.logout(session.id, session.userId);
  }

  async logout(sessionId: string, actorUserId: string): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const result = await manager
        .getRepository(AuthSession)
        .update(
          { id: sessionId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );

      if ((result.affected ?? 0) === 0) return;

      await manager.getRepository(OperationAuditEvent).save(
        this.createAuditEvent({
          actorUserId,
          action: 'AUTH_LOGOUT',
          targetType: 'AUTH_SESSION',
          targetId: sessionId,
          metadata: null,
        }),
      );
    });
  }

  async createInitialAdmin(
    emailInput: string,
    password: string,
  ): Promise<AuthUserResponse> {
    const email = normalizeAuthEmail(emailInput);
    const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const userRepository = manager.getRepository(AuthUser);
      const existingAdmin = await userRepository.findOne({
        where: { role: UserRole.ADMIN },
      });
      if (existingAdmin) {
        throw new ConflictException('An administrator already exists');
      }

      const user = await userRepository.save(
        userRepository.create({
          email,
          passwordHash,
          role: UserRole.ADMIN,
          disabledAt: null,
        }),
      );

      const auditRepository = manager.getRepository(OperationAuditEvent);
      await auditRepository.save(
        this.createAuditEvent({
          actorUserId: null,
          action: 'AUTH_ADMIN_CREATED',
          targetType: 'AUTH_USER',
          targetId: user.id,
          metadata: { source: 'CLI' },
        }),
      );

      return this.toUserResponse(user);
    });
  }

  private async loginInTransaction(
    manager: EntityManager,
    email: string,
    password: string,
  ): Promise<LoginTransactionResult> {
    const auditRepository = manager.getRepository(OperationAuditEvent);
    const identifierHash = this.hashLoginIdentifier(email);
    const now = new Date();
    const attemptRepository = manager.getRepository(AuthLoginAttempt);

    await manager.query(
      `INSERT INTO auth_login_attempts
        (identifier_hash, failed_count, window_started_at, updated_at)
       VALUES (?, 0, ?, ?)
       ON DUPLICATE KEY UPDATE identifier_hash = auth_login_attempts.identifier_hash`,
      [identifierHash, now, now],
    );

    const attempt = await attemptRepository
      .createQueryBuilder('attempt')
      .setLock('pessimistic_write')
      .where('attempt.identifierHash = :identifierHash', { identifierHash })
      .getOneOrFail();
    const windowExpired =
      now.getTime() - attempt.windowStartedAt.getTime() >=
      this.loginWindowSeconds * 1000;

    if (windowExpired) {
      attempt.failedCount = 0;
      attempt.windowStartedAt = now;
      await attemptRepository.save(attempt);
    }

    if (attempt.failedCount >= this.loginMaxAttempts) {
      await auditRepository.save(
        this.createAuditEvent({
          actorUserId: null,
          action: 'AUTH_LOGIN_RATE_LIMITED',
          targetType: 'AUTH_LOGIN_IDENTIFIER',
          targetId: identifierHash,
          metadata: null,
        }),
      );
      return { status: 'RATE_LIMITED' };
    }

    const userRepository = manager.getRepository(AuthUser);
    const user = await userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .setLock('pessimistic_write')
      .where('user.email = :email', { email })
      .getOne();
    const passwordValid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !passwordValid || user.disabledAt) {
      const status = user?.disabledAt ? 'DISABLED' : 'INVALID';
      await auditRepository.save(
        this.createAuditEvent({
          actorUserId: user?.id ?? null,
          action: 'AUTH_LOGIN_FAILED',
          targetType: 'AUTH_LOGIN_IDENTIFIER',
          targetId: identifierHash,
          metadata: { reason: status },
        }),
      );
      attempt.failedCount = Math.min(
        attempt.failedCount + 1,
        this.loginMaxAttempts,
      );
      await attemptRepository.save(attempt);
      return { status };
    }

    await attemptRepository.delete({ identifierHash });
    const sessionRepository = manager.getRepository(AuthSession);
    await sessionRepository.update(
      {
        userId: user.id,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      { revokedAt: now },
    );

    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1000);
    const session = await sessionRepository.save(
      sessionRepository.create({
        userId: user.id,
        tokenHash: this.hashSessionToken(sessionToken),
        expiresAt,
        revokedAt: null,
      }),
    );

    await auditRepository.save(
      this.createAuditEvent({
        actorUserId: user.id,
        action: 'AUTH_LOGIN_SUCCEEDED',
        targetType: 'AUTH_SESSION',
        targetId: session.id,
        metadata: null,
      }),
    );

    return {
      status: 'SUCCESS',
      response: {
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        user: this.toUserResponse(user),
      },
    };
  }

  private createAuditEvent(input: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown> | null;
  }): OperationAuditEvent {
    return this.auditRepository.create({
      ...input,
      traceId: this.asyncContextService.getTraceId() ?? null,
    });
  }

  private toUserResponse(user: AuthUser): AuthUserResponse {
    return { id: user.id, email: user.email, role: user.role };
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken, 'utf8').digest('hex');
  }

  private hashLoginIdentifier(email: string): string {
    return createHash('sha256').update(email, 'utf8').digest('hex');
  }

  private get sessionTtlSeconds(): number {
    return this.configService.get<number>('AUTH_SESSION_TTL_SECONDS', 28_800);
  }

  private get loginMaxAttempts(): number {
    return this.configService.get<number>('AUTH_LOGIN_MAX_ATTEMPTS', 5);
  }

  private get loginWindowSeconds(): number {
    return this.configService.get<number>('AUTH_LOGIN_WINDOW_SECONDS', 900);
  }
}

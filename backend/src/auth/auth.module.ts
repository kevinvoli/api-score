import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSession } from '../database/entities/auth-session.entity';
import { AuthUser } from '../database/entities/auth-user.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { AuthLoginAttempt } from '../database/entities/auth-login-attempt.entity';
import { AuthController } from './auth.controller';
import { AuthenticatedMutationAuditInterceptor } from './authenticated-mutation-audit.interceptor';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuthUser,
      AuthSession,
      OperationAuditEvent,
      AuthLoginAttempt,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthenticatedMutationAuditInterceptor,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { of } from 'rxjs';
import { Repository } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { AuthenticatedMutationAuditInterceptor } from './authenticated-mutation-audit.interceptor';
import { AuthenticatedPrincipal, UserRole } from './auth.types';

describe('AuthenticatedMutationAuditInterceptor', () => {
  const principal: AuthenticatedPrincipal = {
    sessionId: 'session-1',
    id: 'user-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };
  const auditEvent = {
    actorUserId: principal.id,
    action: 'HTTP_MUTATION_ATTEMPT',
    targetType: 'HTTP_ROUTE',
    targetId: 'POST /v1/settings',
    traceId: 'trace-1',
    metadata: null,
  } as OperationAuditEvent;
  const auditRepository = {
    create: jest.fn(() => auditEvent),
    save: jest.fn(async () => auditEvent),
  };
  const asyncContextService = {
    getTraceId: jest.fn(() => 'trace-1'),
  };
  const next: CallHandler = { handle: jest.fn(() => of('ok')) };
  let interceptor: AuthenticatedMutationAuditInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new AuthenticatedMutationAuditInterceptor(
      auditRepository as unknown as Repository<OperationAuditEvent>,
      asyncContextService as unknown as AsyncContextService,
    );
  });

  function contextFor(
    method: string,
    authUser?: AuthenticatedPrincipal,
  ): ExecutionContext {
    const request = {
      method,
      baseUrl: '/v1',
      path: '/settings?secret=hidden',
      route: { path: '/settings' },
      authUser,
      body: { password: 'never-audited' },
      headers: { authorization: 'Bearer never-audited' },
    } as unknown as Request;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  it('journalise une mutation authentifiée sans payload ni secret', async () => {
    await expect(
      interceptor.intercept(contextFor('POST', principal), next),
    ).resolves.toBeDefined();

    expect(auditRepository.create).toHaveBeenCalledWith({
      actorUserId: principal.id,
      action: 'HTTP_MUTATION_ATTEMPT',
      targetType: 'HTTP_ROUTE',
      targetId: 'POST /v1/settings',
      traceId: 'trace-1',
      metadata: null,
    });
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('ignore les lectures et les requêtes sans session', async () => {
    await interceptor.intercept(contextFor('GET', principal), next);
    await interceptor.intercept(contextFor('POST'), next);

    expect(auditRepository.save).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledTimes(2);
  });

  it("bloque la mutation quand l'audit échoue", async () => {
    auditRepository.save.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      interceptor.intercept(contextFor('DELETE', principal), next),
    ).rejects.toThrow('database unavailable');
    expect(next.handle).not.toHaveBeenCalled();
  });
});

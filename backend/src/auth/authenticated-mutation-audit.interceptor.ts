import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { Repository } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { AuthenticatedPrincipal } from './auth.types';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AuthenticatedRequest = Request & {
  authUser?: AuthenticatedPrincipal;
};

@Injectable()
export class AuthenticatedMutationAuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(OperationAuditEvent)
    private readonly auditRepository: Repository<OperationAuditEvent>,
    private readonly asyncContextService: AsyncContextService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method.toUpperCase();

    if (!MUTATION_METHODS.has(method) || !request.authUser) {
      return next.handle();
    }

    const routePath = request.route?.path;
    const path =
      typeof routePath === 'string'
        ? `${request.baseUrl}${routePath}`
        : request.path;

    await this.auditRepository.save(
      this.auditRepository.create({
        actorUserId: request.authUser.id,
        action: 'HTTP_MUTATION_ATTEMPT',
        targetType: 'HTTP_ROUTE',
        targetId: `${method} ${path}`.slice(0, 320),
        traceId: this.asyncContextService.getTraceId() ?? null,
        metadata: null,
      }),
    );

    return next.handle();
  }
}

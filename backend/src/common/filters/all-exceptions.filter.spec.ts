import { ArgumentsHost, ForbiddenException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '../../auth/auth.types';
import { JsonLogger } from '../json.logger';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  it('journalise l’identifiant interne de l’acteur sur un refus 403 sans donnée de session', () => {
    const logger = { error: jest.fn() } as unknown as JsonLogger;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const request = {
      method: 'PUT',
      originalUrl: '/v1/settings/smart-rules',
      traceId: 'trace-1',
      authUser: {
        sessionId: 'session-secret',
        id: 'user-1',
        email: 'operator@example.com',
        role: UserRole.OPERATOR,
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter(logger).catch(new ForbiddenException(), host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_exception',
        statusCode: HttpStatus.FORBIDDEN,
        actorUserId: 'user-1',
      }),
      expect.any(String),
      'Exceptions',
    );
    const serializedLog = JSON.stringify(
      (logger.error as jest.Mock).mock.calls[0][0],
    );
    expect(serializedLog).not.toContain('session-secret');
    expect(serializedLog).not.toContain('operator@example.com');
  });
});

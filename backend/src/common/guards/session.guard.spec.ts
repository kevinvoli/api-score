import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import {
  RequestWithPrincipal,
  SESSION_TOKEN_LENGTH,
  UserRole,
} from '../../auth/auth.types';
import { SessionGuard } from './session.guard';

function createContext(request: RequestWithPrincipal): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let reflector: Reflector;
  let authService: { resolveSession: jest.Mock };
  let guard: SessionGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    authService = { resolveSession: jest.fn() };
    guard = new SessionGuard(reflector, authService as unknown as AuthService);
  });

  it('refuse une requête sans session', async () => {
    await expect(
      guard.canActivate(createContext({ method: 'GET', headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse une session expirée ou révoquée', async () => {
    authService.resolveSession.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          headers: {
            authorization: `Bearer ${'a'.repeat(SESSION_TOKEN_LENGTH)}`,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attache le principal d’une session active', async () => {
    const request: RequestWithPrincipal = {
      method: 'GET',
      headers: {
        authorization: `Bearer ${'a'.repeat(SESSION_TOKEN_LENGTH)}`,
      },
    };
    const principal = {
      sessionId: 'session-1',
      id: 'user-1',
      email: 'operator@example.com',
      role: UserRole.OPERATOR,
    };
    authService.resolveSession.mockResolvedValue(principal);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.authUser).toEqual(principal);
  });

  it('laisse passer une route SessionPublic sans résoudre de session', async () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(
      guard.canActivate(createContext({ method: 'POST', headers: {} })),
    ).resolves.toBe(true);
    expect(authService.resolveSession).not.toHaveBeenCalled();
  });
});

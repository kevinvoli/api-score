import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithPrincipal, UserRole } from '../../auth/auth.types';
import { RolesGuard } from './roles.guard';

function createContext(
  method: string,
  request: Omit<RequestWithPrincipal, 'method'>,
): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ method, ...request }) }),
  } as unknown as ExecutionContext;
}

function createReflector(roles: UserRole[] | undefined): Reflector {
  return {
    getAllAndOverride: jest
      .fn()
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce(false) // isSessionPublic
      .mockReturnValueOnce(roles), // @Roles
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('refuse un rôle insuffisant', () => {
    const guard = new RolesGuard(createReflector([UserRole.OPERATOR]));
    const context = createContext('POST', {
      authUser: {
        sessionId: 'session-1',
        id: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('autorise ADMIN sur une route OPERATOR+', () => {
    const guard = new RolesGuard(createReflector([UserRole.OPERATOR]));

    expect(
      guard.canActivate(
        createContext('POST', {
          authUser: {
            sessionId: 'session-1',
            id: 'user-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        }),
      ),
    ).toBe(true);
  });

  it('autorise un GET sans contrainte de rôle', () => {
    const guard = new RolesGuard(createReflector(undefined));

    expect(guard.canActivate(createContext('GET', {}))).toBe(true);
  });

  it('refuse un POST sans contrainte de rôle pour un VIEWER', () => {
    const guard = new RolesGuard(createReflector(undefined));
    const context = createContext('POST', {
      authUser: {
        sessionId: 'session-1',
        id: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('refuse à OPERATOR une modification de settings sans rôle explicite', () => {
    const guard = new RolesGuard(createReflector(undefined));
    const context = createContext('POST', {
      authUser: {
        sessionId: 'session-1',
        id: 'user-1',
        email: 'operator@example.com',
        role: UserRole.OPERATOR,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('refuse à OPERATOR une mutation administrative sans rôle explicite', () => {
    const guard = new RolesGuard(createReflector(undefined));
    const context = createContext('DELETE', {
      authUser: {
        sessionId: 'session-1',
        id: 'user-1',
        email: 'operator@example.com',
        role: UserRole.OPERATOR,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('autorise OPERATOR quand la mutation déclare explicitement ce rôle', () => {
    const guard = new RolesGuard(createReflector([UserRole.OPERATOR]));

    expect(
      guard.canActivate(
        createContext('PUT', {
          authUser: {
            sessionId: 'session-1',
            id: 'user-1',
            email: 'operator@example.com',
            role: UserRole.OPERATOR,
          },
        }),
      ),
    ).toBe(true);
  });

  it('refuse un rôle hors énumération sur une route @Roles', () => {
    const guard = new RolesGuard(createReflector([UserRole.VIEWER]));
    const context = createContext('GET', {
      authUser: {
        sessionId: 'session-1',
        id: 'user-1',
        email: 'legacy@example.com',
        role: 'LEGACY' as UserRole,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

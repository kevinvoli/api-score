import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithPrincipal, UserRole } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SESSION_PUBLIC_KEY } from '../decorators/session-public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.VIEWER]: 1,
  [UserRole.OPERATOR]: 2,
  [UserRole.ADMIN]: 3,
};

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Niveau minimum appliqué à une mutation (méthode HTTP non sûre) qui n'a pas
 * reçu de @Roles explicite. Les mutations non classifiées restent réservées
 * à ADMIN : seules
 * les routes @Public()/@SessionPublic() (sans principal à évaluer) y
 * échappent.
 */
const DEFAULT_MUTATION_ROLE = UserRole.ADMIN;

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isSessionPublic = this.reflector.getAllAndOverride<boolean>(
      IS_SESSION_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || isSessionPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    if (!requiredRoles?.length) {
      if (SAFE_HTTP_METHODS.has(request.method)) return true;
      return this.assertMinimumRole(request, [DEFAULT_MUTATION_ROLE]);
    }

    return this.assertMinimumRole(request, requiredRoles);
  }

  private assertMinimumRole(
    request: RequestWithPrincipal,
    requiredRoles: UserRole[],
  ): boolean {
    const level = this.resolveRoleLevel(request.authUser?.role);
    if (level === undefined) throw new ForbiddenException();

    const minimumLevel = Math.min(
      ...requiredRoles.map((requiredRole) => ROLE_LEVEL[requiredRole]),
    );
    if (level < minimumLevel) throw new ForbiddenException();

    return true;
  }

  private resolveRoleLevel(role: UserRole | undefined): number | undefined {
    if (!role) return undefined;
    return ROLE_LEVEL[role];
  }
}

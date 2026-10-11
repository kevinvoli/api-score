import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import {
  RequestWithPrincipal,
  SESSION_TOKEN_LENGTH,
} from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SESSION_PUBLIC_KEY } from '../decorators/session-public.decorator';

const BEARER_TOKEN_PATTERN = new RegExp(
  `^Bearer ([A-Za-z0-9_-]{${SESSION_TOKEN_LENGTH}})$`,
);

/**
 * Extraction du jeton porteur partagée par SessionGuard et par le logout
 * (B4), qui doit appliquer le même critère syntaxique sans passer par une
 * session résolue.
 */
export function extractBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  if (typeof authorization !== 'string') return null;
  const match = BEARER_TOKEN_PATTERN.exec(authorization);
  return match?.[1] ?? null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isSessionPublic = this.reflector.getAllAndOverride<boolean>(
      IS_SESSION_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || isSessionPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const sessionToken = extractBearerToken(request.headers?.authorization);
    if (!sessionToken) throw new UnauthorizedException();

    const principal = await this.authService.resolveSession(sessionToken);
    if (!principal) throw new UnauthorizedException();

    request.authUser = principal;
    return true;
  }
}

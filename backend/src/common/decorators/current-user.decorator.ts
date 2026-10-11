import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthenticatedPrincipal,
  RequestWithPrincipal,
} from '../../auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request.authUser) throw new UnauthorizedException();
    return request.authUser;
  },
);

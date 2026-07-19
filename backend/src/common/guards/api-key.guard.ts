import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const apiKey = request.headers?.['x-api-key'];
    const expectedKey = this.configService.get<string>('API_KEY');

    if (!apiKey || !expectedKey) throw new UnauthorizedException();

    const provided = Buffer.from(String(apiKey));
    const expected = Buffer.from(expectedKey);

    if (provided.length !== expected.length) throw new UnauthorizedException();
    if (!crypto.timingSafeEqual(provided, expected))
      throw new UnauthorizedException();

    return true;
  }
}

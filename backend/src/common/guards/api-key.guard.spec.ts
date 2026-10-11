import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SESSION_PUBLIC_KEY } from '../decorators/session-public.decorator';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const API_KEY = 'supersecretapikey123456';

  let guard: ApiKeyGuard;
  let configService: ConfigService;
  let reflector: Reflector;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue(API_KEY),
    } as unknown as ConfigService;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;

    guard = new ApiKeyGuard(configService, reflector);
  });

  it('should throw UnauthorizedException when header is absent', () => {
    const context: ExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when header is invalid', () => {
    const context: ExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': 'wrongkey' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return true when header is valid', () => {
    const context: ExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': API_KEY } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true for @Public() routes without header', () => {
    const publicReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    const publicGuard = new ApiKeyGuard(configService, publicReflector);

    const context: ExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    expect(publicGuard.canActivate(context)).toBe(true);
  });

  it('should require the API key for @SessionPublic() routes', () => {
    const sessionPublicReflector = {
      getAllAndOverride: jest.fn(
        (metadataKey: string) => metadataKey === IS_SESSION_PUBLIC_KEY,
      ),
    } as unknown as Reflector;
    const sessionPublicGuard = new ApiKeyGuard(
      configService,
      sessionPublicReflector,
    );
    const context: ExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    expect(() => sessionPublicGuard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
    expect(sessionPublicReflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
  });
});

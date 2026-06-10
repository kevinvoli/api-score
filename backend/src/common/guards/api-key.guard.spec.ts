import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function makeContext(headerValue: string | undefined, isPublic = false): ExecutionContext {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;

  const request = {
    headers: headerValue !== undefined ? { 'x-api-key': headerValue } : {},
  };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    _reflector: reflector,
  } as unknown as ExecutionContext;
}

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
});

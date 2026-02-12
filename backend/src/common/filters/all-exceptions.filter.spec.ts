import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const buildHost = (
    requestOverrides: Record<string, unknown> = {},
    responseOverrides: Record<string, unknown> = {},
  ) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = {
      method: 'GET',
      url: '/v1/test',
      originalUrl: '/v1/test',
      traceId: 'trace-abc',
      ...requestOverrides,
    };
    const response = { status, ...responseOverrides };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    return { host, status, json };
  };

  it('formats HttpException with standardized payload', () => {
    const logger = { error: jest.fn() } as any;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = buildHost();
    const exception = new BadRequestException(['field_a must be string']);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      details: ['field_a must be string'],
      traceId: 'trace-abc',
    });
  });

  it('formats unknown exception as internal server error', () => {
    const logger = { error: jest.fn() } as any;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = buildHost();

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      details: null,
      traceId: 'trace-abc',
    });
  });
});

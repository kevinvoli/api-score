import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JsonLogger } from '../json.logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = request.traceId ?? 'unknown';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = this.buildPayload(exception, status, traceId);

    this.logger.error(
      {
        event: 'http_exception',
        method: request.method,
        path: request.originalUrl ?? request.url,
        statusCode: status,
        responseCode: payload.code,
      },
      exception instanceof Error ? exception.stack : undefined,
      'Exceptions',
    );

    response.status(status).json(payload);
  }

  private buildPayload(
    exception: unknown,
    status: number,
    traceId: string,
  ): { code: string; message: string; details: unknown; traceId: string } {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const { message, details } = this.extractExceptionDetails(exceptionResponse);

      return {
        code: this.toErrorCode(status),
        message,
        details,
        traceId,
      };
    }

    return {
      code: this.toErrorCode(status),
      message: 'Internal server error',
      details: null,
      traceId,
    };
  }

  private extractExceptionDetails(exceptionResponse: unknown): {
    message: string;
    details: unknown;
  } {
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse, details: null };
    }

    if (
      !exceptionResponse ||
      typeof exceptionResponse !== 'object' ||
      Array.isArray(exceptionResponse)
    ) {
      return { message: 'Request failed', details: null };
    }

    const typedResponse = exceptionResponse as Record<string, unknown>;
    const rawMessage = typedResponse.message;
    const message = Array.isArray(rawMessage)
      ? 'Validation failed'
      : typeof rawMessage === 'string'
      ? rawMessage
      : 'Request failed';

    const details = Array.isArray(rawMessage)
      ? rawMessage
      : (typedResponse.details ?? null);

    return { message, details };
  }

  private toErrorCode(status: number): string {
    const statusCodeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
      [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
    };

    return statusCodeMap[status] ?? `HTTP_${status}`;
  }
}

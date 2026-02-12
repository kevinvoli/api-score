import { Injectable, LoggerService } from '@nestjs/common';
import { AsyncContextService } from './async-context.service';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

@Injectable()
export class JsonLogger implements LoggerService {
  private readonly sensitiveKeys = [
    'authorization',
    'apiKey',
    'api_key',
    'x-api-key',
    'x-rapidapi-key',
    'token',
    'secret',
    'password',
    'db_url',
  ];

  constructor(private readonly asyncContextService: AsyncContextService) {}

  log(message: any, context?: string): void {
    this.print('log', message, context);
  }

  error(message: any, trace?: string, context?: string): void {
    this.print('error', message, context, trace);
  }

  warn(message: any, context?: string): void {
    this.print('warn', message, context);
  }

  debug(message: any, context?: string): void {
    this.print('debug', message, context);
  }

  verbose(message: any, context?: string): void {
    this.print('verbose', message, context);
  }

  private print(level: LogLevel, message: any, context?: string, trace?: string): void {
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: this.redactSensitiveData(message),
    };

    if (context) {
      payload.context = context;
    }

    if (trace) {
      payload.trace = trace;
    }

    const traceId = this.asyncContextService.getTraceId();
    if (traceId) {
      payload.traceId = traceId;
    }

    const line = JSON.stringify(payload);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(line);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(line);
  }

  private redactSensitiveData(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveData(item));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce(
        (acc, [key, entryValue]) => {
          const normalizedKey = key.toLowerCase();
          const isSensitive = this.sensitiveKeys.some((sensitiveKey) =>
            normalizedKey.includes(sensitiveKey.toLowerCase()),
          );

          acc[key] = isSensitive ? '[REDACTED]' : this.redactSensitiveData(entryValue);
          return acc;
        },
        {} as Record<string, unknown>,
      );
    }

    return value;
  }
}

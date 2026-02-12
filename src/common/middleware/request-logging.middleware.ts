import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { JsonLogger } from '../json.logger';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        {
          event: 'http_request_completed',
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs,
        },
        'HTTP',
      );
    });

    next();
  }
}

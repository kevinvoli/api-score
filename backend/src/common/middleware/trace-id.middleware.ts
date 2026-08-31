import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AsyncContextService } from '../async-context.service';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  constructor(private readonly asyncContextService: AsyncContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incomingTraceId = req.header('x-trace-id');
    const traceId =
      incomingTraceId && incomingTraceId.trim()
        ? incomingTraceId
        : randomUUID();

    (req as { traceId?: string }).traceId = traceId;
    res.setHeader('x-trace-id', traceId);

    this.asyncContextService.run(traceId, next);
  }
}

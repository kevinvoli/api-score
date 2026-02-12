import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = {
  traceId: string;
};

@Injectable()
export class AsyncContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(traceId: string, callback: () => void): void {
    this.storage.run({ traceId }, callback);
  }

  getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }
}

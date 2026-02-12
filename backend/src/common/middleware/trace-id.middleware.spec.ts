import { AsyncContextService } from '../async-context.service';
import { TraceIdMiddleware } from './trace-id.middleware';

describe('TraceIdMiddleware', () => {
  it('sets x-trace-id header from request header', () => {
    const asyncContextService = new AsyncContextService();
    const middleware = new TraceIdMiddleware(asyncContextService);
    const req: any = {
      header: jest.fn().mockReturnValue('trace-123'),
    };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.traceId).toBe('trace-123');
    expect(setHeader).toHaveBeenCalledWith('x-trace-id', 'trace-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a trace id when request does not provide one', () => {
    const asyncContextService = new AsyncContextService();
    const middleware = new TraceIdMiddleware(asyncContextService);
    const req: any = {
      header: jest.fn().mockReturnValue(undefined),
    };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(typeof req.traceId).toBe('string');
    expect(req.traceId.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('x-trace-id', req.traceId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

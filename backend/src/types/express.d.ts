import 'express-serve-static-core';

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

export {};

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so rejected promises are forwarded to Express's
 * error handling middleware instead of crashing the process or hanging the
 * request. This keeps controllers free of repetitive try/catch blocks.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

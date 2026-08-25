import type { NextFunction, Request, Response } from 'express';

/**
 * Logs each request with method, path, status code and duration once the
 * response finishes, using the request-scoped child logger (which includes the
 * correlation id). Must run after requestContext.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    req.log.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });
  next();
}

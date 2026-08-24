import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

interface JsonParseError extends Error {
  type?: string;
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

/**
 * Central error handler. Converts thrown errors into a consistent JSON shape.
 * Operational (expected) errors expose their message; unexpected errors are
 * logged with a stack trace and returned as a generic 500.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Malformed JSON body from express.json()
  if (err && (err as JsonParseError).type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack });
    } else {
      logger.warn(err.message, { code: err.code, details: err.details });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled error', { message, stack });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

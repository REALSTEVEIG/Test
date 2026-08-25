import type { NextFunction, Request, Response } from 'express';
import logger, { type Logger } from '../utils/logger';
import { AppError } from '../errors/AppError';

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

function reqLogger(req: Request): Logger {
  return req.log ?? logger;
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: req.id,
    },
  });
}

/**
 * Central error handler. Converts thrown errors into a consistent JSON shape.
 * Operational (expected) errors expose their message; unexpected errors are
 * logged with a stack trace and returned as a generic 500.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id;

  // Errors raised by express.json() / body-parser carry a `type` and status.
  const bodyErr = err as BodyParserError;
  if (bodyErr && typeof bodyErr.type === 'string') {
    if (bodyErr.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON', requestId },
      });
      return;
    }
    if (bodyErr.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the size limit',
          requestId,
        },
      });
      return;
    }
    const status = bodyErr.status ?? bodyErr.statusCode ?? 400;
    res.status(status).json({
      error: { code: 'BAD_REQUEST', message: bodyErr.message || 'Invalid request body', requestId },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      reqLogger(req).error(err.message, { code: err.code, stack: err.stack });
    } else {
      reqLogger(req).warn(err.message, { code: err.code, details: err.details });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  reqLogger(req).error('Unhandled error', { message, stack });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
  });
}

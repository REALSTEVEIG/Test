import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import logger, { type Logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
    }
  }
}

/**
 * Assigns each request a correlation id (honoring an inbound `X-Request-Id`
 * header when present) and attaches a child logger bound to that id. The id is
 * echoed back in the `X-Request-Id` response header so clients and logs can be
 * correlated end-to-end.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  const id = inbound && inbound.trim() !== '' ? inbound.trim().slice(0, 128) : randomUUID();
  req.id = id;
  req.log = logger.child({ requestId: id });
  res.setHeader('X-Request-Id', id);
  next();
}

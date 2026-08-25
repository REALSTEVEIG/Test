import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { getConfig } from './config';
import paymentRoutes from './routes/paymentRoutes';
import openapiSpec from './docs/openapi';
import { requestContext } from './middleware/requestContext';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Builds and returns the configured Express app. Exported separately from the
 * server so tests can import the app directly with Supertest (no open port).
 */
export function createApp(): Express {
  const config = getConfig();
  const app = express();

  // Trust the first proxy hop so rate-limiting & IPs work behind a load balancer.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers and CORS.
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));

  // Body parsing with an explicit size limit.
  app.use(express.json({ limit: config.bodyLimit }));

  // Correlation id + request logging.
  app.use(requestContext);
  app.use(requestLogger);

  // Liveness/readiness probe (not rate-limited).
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // API docs.
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.get('/openapi.json', (_req: Request, res: Response) => res.json(openapiSpec));

  // Rate limiting for the API surface.
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
          requestId: req.id,
        },
      });
    },
  });

  // Resource routes.
  app.use('/payments', limiter, paymentRoutes);

  // 404 + error handling (order matters: these go last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;

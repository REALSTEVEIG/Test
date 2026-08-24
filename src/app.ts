import express, { type Express, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';

import paymentRoutes from './routes/paymentRoutes';
import openapiSpec from './docs/openapi';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Builds and returns the configured Express app. Exported separately from the
 * server so tests can import the app directly with Supertest (no open port).
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  // Health check.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  // API docs.
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.get('/openapi.json', (_req: Request, res: Response) => res.json(openapiSpec));

  // Resource routes.
  app.use('/payments', paymentRoutes);

  // 404 + error handling (order matters: these go last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;

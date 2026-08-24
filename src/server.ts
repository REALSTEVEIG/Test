import { createApp } from './app';
import logger from './utils/logger';

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info('Payment service listening', { port: PORT, url: `http://localhost:${PORT}` });
  logger.info('API docs available', { url: `http://localhost:${PORT}/api-docs` });
});

// Graceful shutdown.
function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  // Force-exit if it hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}

(['SIGINT', 'SIGTERM'] as const).forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

export default server;

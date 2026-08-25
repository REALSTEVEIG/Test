import type { Server } from 'http';
import { createApp } from './app';
import { getConfig, ConfigError } from './config';
import logger from './utils/logger';

function start(): Server {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    // Fail fast on invalid configuration.
    const message = err instanceof ConfigError ? err.message : String(err);
    // Use stderr directly since the logger depends on config.
    process.stderr.write(`Fatal configuration error: ${message}\n`);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('Payment service listening', {
      port: config.port,
      env: config.nodeEnv,
      url: `http://localhost:${config.port}`,
    });
    logger.info('API docs available', { url: `http://localhost:${config.port}/api-docs` });
  });

  // Graceful shutdown.
  let shuttingDown = false;
  function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);
    server.close((err) => {
      if (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }
      logger.info('Server closed');
      process.exit(0);
    });
    // Force-exit if it hangs.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  (['SIGINT', 'SIGTERM'] as const).forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    // An uncaught exception leaves the process in an undefined state; exit and
    // let the orchestrator (Docker/K8s/systemd) restart a clean instance.
    shutdown('uncaughtException');
  });

  return server;
}

const server = start();

export default server;

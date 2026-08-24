import type { LogMeta } from '../types';

/**
 * Minimal structured logger.
 *
 * Emits single-line JSON so logs are easy to grep locally and easy to ingest
 * into a log aggregator in a real deployment. Log level is controlled via the
 * LOG_LEVEL env var (error | warn | info | debug). During tests we stay silent
 * unless LOG_LEVEL is explicitly set, to keep test output readable.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type Level = keyof typeof LEVELS;
type ActiveLevel = Level | 'silent';

function resolveLevel(): ActiveLevel {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  if (envLevel in LEVELS) return envLevel as Level;
  if (process.env.NODE_ENV === 'test') return 'silent';
  return 'info';
}

function write(level: Level, message: string, meta?: LogMeta): void {
  const activeLevel = resolveLevel();
  if (activeLevel === 'silent') return;
  if (LEVELS[level] > LEVELS[activeLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === 'object' ? { meta } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

const logger = {
  error: (msg: string, meta?: LogMeta): void => write('error', msg, meta),
  warn: (msg: string, meta?: LogMeta): void => write('warn', msg, meta),
  info: (msg: string, meta?: LogMeta): void => write('info', msg, meta),
  debug: (msg: string, meta?: LogMeta): void => write('debug', msg, meta),
};

export default logger;

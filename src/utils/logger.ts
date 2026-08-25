import { getConfig } from '../config';
import type { LogMeta } from '../types';

/**
 * Minimal structured logger.
 *
 * Emits single-line JSON so logs are easy to grep locally and easy to ingest
 * into a log aggregator (Datadog, CloudWatch, etc.) in a real deployment. The
 * active level comes from validated config (LOG_LEVEL), and is `silent` during
 * tests unless explicitly overridden.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type Level = keyof typeof LEVELS;

function isEnabled(level: Level): boolean {
  const active = getConfig().logLevel;
  if (active === 'silent') return false;
  return LEVELS[level] <= LEVELS[active];
}

function write(level: Level, message: string, meta?: LogMeta): void {
  if (!isEnabled(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === 'object' ? meta : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export interface Logger {
  error: (msg: string, meta?: LogMeta) => void;
  warn: (msg: string, meta?: LogMeta) => void;
  info: (msg: string, meta?: LogMeta) => void;
  debug: (msg: string, meta?: LogMeta) => void;
  child: (bindings: LogMeta) => Logger;
}

function makeLogger(bindings: LogMeta = {}): Logger {
  const merge = (meta?: LogMeta): LogMeta => ({ ...bindings, ...(meta || {}) });
  return {
    error: (msg, meta) => write('error', msg, merge(meta)),
    warn: (msg, meta) => write('warn', msg, merge(meta)),
    info: (msg, meta) => write('info', msg, merge(meta)),
    debug: (msg, meta) => write('debug', msg, merge(meta)),
    // Returns a logger that always includes the given bindings (e.g. requestId).
    child: (extra: LogMeta) => makeLogger({ ...bindings, ...extra }),
  };
}

const logger = makeLogger();

export default logger;

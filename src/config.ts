import 'dotenv/config';

/**
 * Centralized, validated application configuration.
 *
 * All environment variables are read and validated exactly once, here, at
 * startup. Invalid configuration throws immediately (fail-fast) so a
 * misconfigured service never starts and silently misbehaves in production.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';
export type Persistence = 'memory' | 'file';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: LogLevel;
  persistence: Persistence;
  dataDir: string;
  processingDelayMs: number;
  failureRate: number;
  bodyLimit: string;
  rateLimit: {
    windowMs: number;
    max: number;
  };
  corsOrigin: string;
}

class ConfigError extends Error {}

function readInt(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`Invalid ${name}: "${value}" (expected integer in [${min}, ${max}])`);
  }
  return n;
}

function readFloat(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (Number.isNaN(n) || n < min || n > max) {
    throw new ConfigError(`Invalid ${name}: "${value}" (expected number in [${min}, ${max}])`);
  }
  return n;
}

function readEnum<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value.trim() === '') return fallback;
  const v = value.toLowerCase() as T;
  if (!allowed.includes(v)) {
    throw new ConfigError(`Invalid ${name}: "${value}" (expected one of: ${allowed.join(', ')})`);
  }
  return v;
}

function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // During tests, default logging to silent unless explicitly overridden.
  const defaultLogLevel: LogLevel = nodeEnv === 'test' ? 'silent' : 'info';

  return {
    nodeEnv,
    port: readInt('PORT', process.env.PORT, 3000, 1, 65535),
    logLevel: readEnum<LogLevel>(
      'LOG_LEVEL',
      process.env.LOG_LEVEL,
      ['error', 'warn', 'info', 'debug', 'silent'],
      defaultLogLevel,
    ),
    persistence: readEnum<Persistence>(
      'PERSISTENCE',
      process.env.PERSISTENCE,
      ['memory', 'file'],
      'memory',
    ),
    dataDir: process.env.DATA_DIR || 'data',
    processingDelayMs: readInt(
      'PROCESSING_DELAY_MS',
      process.env.PROCESSING_DELAY_MS,
      800,
      0,
      600000,
    ),
    failureRate: readFloat('PAYMENT_FAILURE_RATE', process.env.PAYMENT_FAILURE_RATE, 0.15, 0, 1),
    bodyLimit: process.env.BODY_LIMIT || '100kb',
    rateLimit: {
      windowMs: readInt(
        'RATE_LIMIT_WINDOW_MS',
        process.env.RATE_LIMIT_WINDOW_MS,
        60000,
        1000,
        3600000,
      ),
      max: readInt('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX, 100, 1, 1000000),
    },
    corsOrigin: process.env.CORS_ORIGIN || '*',
  };
}

let cached: AppConfig | null = null;

/** Returns the validated singleton config, loading it on first access. */
export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

/** Test helper: force config to be re-read (e.g. after mutating process.env). */
export function _resetConfig(): void {
  cached = null;
}

export { ConfigError };

import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';
import type { Payment } from '../types';

/**
 * Persistence layer for payments.
 *
 * Defaults to an in-memory Map for simplicity and fast tests. If PERSISTENCE
 * is set to "file", records are additionally persisted to a JSON file on disk
 * so data survives restarts. The public API is async on purpose so the
 * in-memory and file-based implementations are interchangeable and so callers
 * are written against a realistic (async) datastore contract.
 */

const USE_FILE = (process.env.PERSISTENCE || 'memory').toLowerCase() === 'file';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'payments.json');

let payments = new Map<string, Payment>();
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (!USE_FILE || loaded) return;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw) as Payment[];
    payments = new Map(arr.map((p) => [p.id, p]));
    logger.info('Loaded payments from disk', { count: payments.size, file: DATA_FILE });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      payments = new Map();
    } else {
      logger.error('Failed to load payments file, starting empty', { error: e.message });
      payments = new Map();
    }
  }
  loaded = true;
}

async function flush(): Promise<void> {
  if (!USE_FILE) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const arr = Array.from(payments.values());
  await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

export async function create(payment: Payment): Promise<Payment> {
  await ensureLoaded();
  payments.set(payment.id, payment);
  await flush();
  return { ...payment };
}

export async function findById(id: string): Promise<Payment | null> {
  await ensureLoaded();
  const found = payments.get(id);
  return found ? { ...found } : null;
}

export async function update(id: string, patch: Partial<Payment>): Promise<Payment | null> {
  await ensureLoaded();
  const existing = payments.get(id);
  if (!existing) return null;
  const updated: Payment = { ...existing, ...patch };
  payments.set(id, updated);
  await flush();
  return { ...updated };
}

export async function list(): Promise<Payment[]> {
  await ensureLoaded();
  return Array.from(payments.values()).map((p) => ({ ...p }));
}

/** Test helper: wipe all data (in-memory + file cache state). */
export async function _reset(): Promise<void> {
  payments = new Map();
  loaded = USE_FILE ? true : false;
  if (USE_FILE) {
    try {
      await fs.rm(DATA_FILE, { force: true });
    } catch {
      /* ignore */
    }
  }
}

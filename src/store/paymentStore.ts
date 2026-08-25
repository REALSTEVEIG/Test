import fs from 'fs/promises';
import path from 'path';
import { getConfig } from '../config';
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
 *
 * File writes are atomic (write to a temp file then rename) and serialized
 * through a mutex, so a crash mid-write cannot corrupt the data file and
 * concurrent writes cannot interleave.
 */

function useFile(): boolean {
  return getConfig().persistence === 'file';
}

function dataDir(): string {
  return path.resolve(getConfig().dataDir);
}

function dataFile(): string {
  return path.join(dataDir(), 'payments.json');
}

let payments = new Map<string, Payment>();
let writeChain: Promise<void> = Promise.resolve();
// Memoized load promise ensures the initial read happens exactly once even
// under concurrent access (avoids a check-then-act race that would wipe writes).
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (!useFile()) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      const file = dataFile();
      try {
        const raw = await fs.readFile(file, 'utf8');
        const arr = JSON.parse(raw) as Payment[];
        payments = new Map(arr.map((p) => [p.id, p]));
        logger.info('Loaded payments from disk', { count: payments.size, file });
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          // No file yet: keep the existing (empty) map.
        } else {
          // Corrupt/unreadable file: log loudly but start empty rather than crash-loop.
          logger.error('Failed to load payments file, starting empty', { error: e.message, file });
          payments = new Map();
        }
      }
    })();
  }
  return loadPromise;
}

/**
 * Atomically persist the current state. Serialized via a promise chain so
 * writes never overlap. Writes to a temp file and renames over the target,
 * which is atomic on the same filesystem.
 */
function flush(): Promise<void> {
  if (!useFile()) return Promise.resolve();

  writeChain = writeChain.then(async () => {
    const dir = dataDir();
    const file = dataFile();
    const tmp = path.join(dir, `.payments.${process.pid}.${Date.now()}.tmp`);
    await fs.mkdir(dir, { recursive: true });
    const arr = Array.from(payments.values());
    await fs.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8');
    await fs.rename(tmp, file);
  });

  return writeChain;
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

export interface ListOptions {
  limit: number;
  offset: number;
}

export interface ListResult {
  items: Payment[];
  total: number;
}

/** Returns a page of payments (newest first) plus the total count. */
export async function list(options: ListOptions): Promise<ListResult> {
  await ensureLoaded();
  const all = Array.from(payments.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  const items = all.slice(options.offset, options.offset + options.limit).map((p) => ({ ...p }));
  return { items, total: all.length };
}

/** Test helper: wipe all data (in-memory + file cache state). */
export async function _reset(): Promise<void> {
  // Wait for any pending writes to settle before wiping to avoid races in tests.
  try {
    await writeChain;
  } catch {
    /* ignore */
  }
  payments = new Map();
  writeChain = Promise.resolve();
  if (useFile()) {
    try {
      await fs.rm(dataFile(), { force: true });
    } catch {
      /* ignore */
    }
    // Force a fresh load next access (file was just removed).
    loadPromise = Promise.resolve();
  } else {
    loadPromise = null;
  }
}

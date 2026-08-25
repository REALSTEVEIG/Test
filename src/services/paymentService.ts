import { randomUUID } from 'crypto';
import { getConfig } from '../config';
import * as store from '../store/paymentStore';
import logger from '../utils/logger';
import { KeyedMutex } from '../utils/mutex';
import {
  PAYMENT_STATUS,
  canTransition,
  isTerminal,
  validateCreateInput,
  validateStatusUpdateInput,
} from '../models/payment';
import { ConflictError, NotFoundError } from '../errors/AppError';
import type { Payment, PaymentStatus } from '../types';

/**
 * Business logic for payments.
 *
 * The "processing" of a payment is simulated asynchronously: on creation a
 * payment starts as PENDING and a background async task moves it through
 * PROCESSING and finally to COMPLETED or FAILED after a short, randomized
 * delay (mimicking a call to an external payment gateway).
 *
 * All read-modify-write operations on a single payment are serialized through a
 * per-id mutex, so a manual status update cannot race with (and clobber) the
 * background processing task.
 */

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Serializes operations per payment id.
const locks = new KeyedMutex();

// Track in-flight background tasks so callers/tests can await settling.
const inFlight = new Map<string, Promise<unknown>>();

export interface ListPaymentsParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedPayments {
  items: Payment[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Create a payment. Returns immediately with a PENDING payment while the
 * processing simulation runs in the background.
 */
export async function createPayment(body: unknown): Promise<Payment> {
  const input = validateCreateInput(body);
  const now = new Date().toISOString();

  const payment: Payment = {
    id: randomUUID(),
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    status: PAYMENT_STATUS.PENDING,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    processedAt: null,
  };

  const saved = await store.create(payment);
  logger.info('Payment created', {
    paymentId: saved.id,
    amount: saved.amount,
    currency: saved.currency,
    method: saved.method,
  });

  // Kick off background processing without blocking the response.
  const task = simulateProcessing(saved.id).catch((err: unknown) => {
    logger.error('Background processing crashed', {
      paymentId: saved.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  inFlight.set(saved.id, task);
  void task.finally(() => inFlight.delete(saved.id));

  return saved;
}

/**
 * The async gateway simulation: PENDING -> PROCESSING -> COMPLETED|FAILED.
 *
 * Guarded so that if the payment was manually moved to a terminal/other state
 * before processing ran, we do not overwrite it.
 */
export async function simulateProcessing(id: string): Promise<PaymentStatus | null> {
  const { processingDelayMs, failureRate } = getConfig();

  // Move to PROCESSING (only if still PENDING).
  const started = await locks.runExclusive(id, async () => {
    const current = await store.findById(id);
    if (!current || current.status !== PAYMENT_STATUS.PENDING) return null;
    return store.update(id, {
      status: PAYMENT_STATUS.PROCESSING,
      updatedAt: new Date().toISOString(),
    });
  });

  if (!started) {
    logger.debug('Skipping processing; payment no longer PENDING', { paymentId: id });
    return null;
  }
  logger.debug('Payment processing started', { paymentId: id });

  await delay(processingDelayMs);

  // Settle to COMPLETED or FAILED (only if still PROCESSING).
  return locks.runExclusive(id, async () => {
    const current = await store.findById(id);
    if (!current || current.status !== PAYMENT_STATUS.PROCESSING) {
      logger.debug('Skipping settlement; payment no longer PROCESSING', { paymentId: id });
      return null;
    }

    const succeeded = Math.random() >= failureRate;
    const finalStatus: PaymentStatus = succeeded ? PAYMENT_STATUS.COMPLETED : PAYMENT_STATUS.FAILED;
    const now = new Date().toISOString();

    await store.update(id, {
      status: finalStatus,
      failureReason: succeeded ? null : 'Simulated gateway decline',
      processedAt: now,
      updatedAt: now,
    });

    logger.info('Payment processing finished', { paymentId: id, status: finalStatus });
    return finalStatus;
  });
}

export async function getPaymentById(id: string): Promise<Payment> {
  const payment = await store.findById(id);
  if (!payment) {
    throw new NotFoundError(`Payment with id "${id}" was not found`);
  }
  return payment;
}

export async function listPayments(params: ListPaymentsParams = {}): Promise<PaginatedPayments> {
  const limit = clampInt(params.limit, 20, 1, 100);
  const offset = clampInt(params.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const { items, total } = await store.list({ limit, offset });
  return { items, total, limit, offset };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Manually update a payment's status, enforcing the allowed state machine.
 * Serialized per-id so it cannot race with background processing.
 */
export async function updatePaymentStatus(id: string, body: unknown): Promise<Payment> {
  const { status: nextStatus } = validateStatusUpdateInput(body);

  return locks.runExclusive(id, async () => {
    const existing = await store.findById(id);
    if (!existing) {
      throw new NotFoundError(`Payment with id "${id}" was not found`);
    }

    if (isTerminal(existing.status) && existing.status !== nextStatus) {
      throw new ConflictError(
        `Payment is in a terminal state (${existing.status}) and cannot be changed`,
        { from: existing.status, to: nextStatus },
      );
    }

    if (!canTransition(existing.status, nextStatus)) {
      throw new ConflictError(
        `Cannot transition payment from ${existing.status} to ${nextStatus}`,
        { from: existing.status, to: nextStatus },
      );
    }

    const now = new Date().toISOString();
    const patch: Partial<Payment> = { status: nextStatus, updatedAt: now };
    if (nextStatus === PAYMENT_STATUS.COMPLETED || nextStatus === PAYMENT_STATUS.FAILED) {
      patch.processedAt = existing.processedAt ?? now;
    }
    if (nextStatus !== PAYMENT_STATUS.FAILED) {
      patch.failureReason = null;
    }

    const updated = await store.update(id, patch);
    logger.info('Payment status updated', { paymentId: id, from: existing.status, to: nextStatus });
    // update() only returns null when the record is missing, which we already checked.
    return updated as Payment;
  });
}

/**
 * Test/utility helper: await any in-flight background processing to settle.
 */
export async function waitForProcessing(id?: string): Promise<void> {
  if (id) {
    const task = inFlight.get(id);
    if (task) await task;
    return;
  }
  await Promise.all(Array.from(inFlight.values()));
}

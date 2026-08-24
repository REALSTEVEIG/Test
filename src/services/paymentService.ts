import { randomUUID } from 'crypto';
import * as store from '../store/paymentStore';
import logger from '../utils/logger';
import {
  PAYMENT_STATUS,
  canTransition,
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
 * delay (mimicking a call to an external payment gateway). This demonstrates
 * async programming (Promises, timers, background work) in a realistic setting
 * without any real external dependency.
 */

function clampRate(n: number): number {
  if (Number.isNaN(n)) return 0.15;
  return Math.min(1, Math.max(0, n));
}

// Tunable knobs (env-overridable so tests can make processing fast/deterministic).
const PROCESSING_DELAY_MS = Number(process.env.PROCESSING_DELAY_MS ?? 800);
const FAILURE_RATE = clampRate(Number(process.env.PAYMENT_FAILURE_RATE ?? 0.15));

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Track in-flight background tasks so callers/tests can await settling.
const inFlight = new Map<string, Promise<unknown>>();

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
  logger.info('Payment created', { id: saved.id, amount: saved.amount, currency: saved.currency });

  // Kick off background processing without blocking the response.
  const task = simulateProcessing(saved.id).catch((err: unknown) => {
    logger.error('Background processing crashed', {
      id: saved.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  inFlight.set(saved.id, task);
  void task.finally(() => inFlight.delete(saved.id));

  return saved;
}

/**
 * The async gateway simulation: PENDING -> PROCESSING -> COMPLETED|FAILED.
 */
export async function simulateProcessing(id: string): Promise<PaymentStatus> {
  await store.update(id, {
    status: PAYMENT_STATUS.PROCESSING,
    updatedAt: new Date().toISOString(),
  });
  logger.debug('Payment processing started', { id });

  await delay(PROCESSING_DELAY_MS);

  const succeeded = Math.random() >= FAILURE_RATE;
  const finalStatus: PaymentStatus = succeeded ? PAYMENT_STATUS.COMPLETED : PAYMENT_STATUS.FAILED;
  const now = new Date().toISOString();

  await store.update(id, {
    status: finalStatus,
    failureReason: succeeded ? null : 'Simulated gateway decline',
    processedAt: now,
    updatedAt: now,
  });

  logger.info('Payment processing finished', { id, status: finalStatus });
  return finalStatus;
}

export async function getPaymentById(id: string): Promise<Payment> {
  const payment = await store.findById(id);
  if (!payment) {
    throw new NotFoundError(`Payment with id "${id}" was not found`);
  }
  return payment;
}

export async function listPayments(): Promise<Payment[]> {
  return store.list();
}

/**
 * Manually update a payment's status, enforcing the allowed state machine.
 */
export async function updatePaymentStatus(id: string, body: unknown): Promise<Payment> {
  const { status: nextStatus } = validateStatusUpdateInput(body);
  const existing = await store.findById(id);
  if (!existing) {
    throw new NotFoundError(`Payment with id "${id}" was not found`);
  }

  if (!canTransition(existing.status, nextStatus)) {
    throw new ConflictError(`Cannot transition payment from ${existing.status} to ${nextStatus}`, {
      from: existing.status,
      to: nextStatus,
    });
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
  logger.info('Payment status updated', { id, from: existing.status, to: nextStatus });
  // update() only returns null when the record is missing, which we already checked.
  return updated as Payment;
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

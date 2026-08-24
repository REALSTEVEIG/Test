import { ValidationError } from '../errors/AppError';
import type { CreatePaymentInput, FieldError, StatusUpdateInput } from '../types';

/**
 * Domain constants and validation for the Payment resource.
 */

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'NGN', 'CAD', 'AUD'] as const;

/**
 * Which status transitions are allowed. Keeps the state machine explicit so an
 * update cannot, for example, move a COMPLETED payment back to PENDING.
 */
export const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['REFUNDED'],
  FAILED: ['PENDING'], // allow retry
  REFUNDED: [],
  CANCELLED: [],
};

const STATUS_VALUES = Object.values(PAYMENT_STATUS);

export function isValidStatus(status: unknown): status is PaymentStatus {
  return typeof status === 'string' && (STATUS_VALUES as string[]).includes(status);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Validate and normalize the body for creating a payment.
 */
export function validateCreateInput(body: unknown): CreatePaymentInput {
  const errors: FieldError[] = [];
  const data: Record<string, unknown> =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const amount = data['amount'];
  if (amount === undefined || amount === null) {
    errors.push({ field: 'amount', message: 'amount is required' });
  } else if (typeof amount !== 'number' || Number.isNaN(amount)) {
    errors.push({ field: 'amount', message: 'amount must be a number' });
  } else if (!Number.isFinite(amount)) {
    errors.push({ field: 'amount', message: 'amount must be finite' });
  } else if (amount <= 0) {
    errors.push({ field: 'amount', message: 'amount must be greater than 0' });
  } else if (Math.round(amount * 100) !== amount * 100) {
    errors.push({ field: 'amount', message: 'amount supports at most 2 decimal places' });
  }

  let currency = data['currency'];
  if (currency === undefined || currency === null) {
    errors.push({ field: 'currency', message: 'currency is required' });
  } else if (typeof currency !== 'string') {
    errors.push({ field: 'currency', message: 'currency must be a string' });
  } else {
    currency = currency.toUpperCase();
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency as string)) {
      errors.push({
        field: 'currency',
        message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
      });
    }
  }

  let method = data['method'];
  if (method === undefined || method === null) {
    errors.push({ field: 'method', message: 'method is required' });
  } else if (typeof method !== 'string' || method.trim() === '') {
    errors.push({ field: 'method', message: 'method must be a non-empty string' });
  } else {
    method = method.trim();
  }

  const description = data['description'];
  if (description !== undefined && typeof description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string' });
  }

  const metadata = data['metadata'];
  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' || Array.isArray(metadata) || metadata === null)
  ) {
    errors.push({ field: 'metadata', message: 'metadata must be an object' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid payment payload', errors);
  }

  return {
    amount: amount as number,
    currency: currency as string,
    method: method as string,
    description: description as string | undefined,
    metadata: metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Validate the body for a status update.
 */
export function validateStatusUpdateInput(body: unknown): StatusUpdateInput {
  const data: Record<string, unknown> =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const raw = data['status'];
  const status = typeof raw === 'string' ? raw.toUpperCase() : raw;

  if (status === undefined || status === null) {
    throw new ValidationError('Invalid status update payload', [
      { field: 'status', message: 'status is required' },
    ]);
  }
  if (!isValidStatus(status)) {
    throw new ValidationError('Invalid status update payload', [
      {
        field: 'status',
        message: `status must be one of: ${STATUS_VALUES.join(', ')}`,
      },
    ]);
  }

  return { status };
}

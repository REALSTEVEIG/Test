import type { PaymentStatus } from './models/payment';

export type { PaymentStatus };

/** A fully-formed, persisted payment record. */
export interface Payment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  description: string | null;
  metadata: Record<string, unknown>;
  status: PaymentStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

/** Validated input accepted by the service to create a payment. */
export interface CreatePaymentInput {
  amount: number;
  currency: string;
  method: string;
  description?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** Validated input accepted by the service to update a payment's status. */
export interface StatusUpdateInput {
  status: PaymentStatus;
}

/** A single field-level validation problem. */
export interface FieldError {
  field: string;
  message: string;
}

/** Structured metadata attached to a log entry. */
export type LogMeta = Record<string, unknown>;

import type { Request, Response } from 'express';
import * as paymentService from '../services/paymentService';
import { asyncHandler } from '../middleware/asyncHandler';

/**
 * POST /payments — create a new payment (starts async processing).
 */
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.createPayment(req.body);
  res.status(201).json({ data: payment });
});

/**
 * GET /payments — list all payments.
 */
export const listPayments = asyncHandler(async (_req: Request, res: Response) => {
  const payments = await paymentService.listPayments();
  res.status(200).json({ data: payments, count: payments.length });
});

/**
 * GET /payments/:id — retrieve a single payment.
 */
export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.getPaymentById(req.params.id as string);
  res.status(200).json({ data: payment });
});

/**
 * PATCH /payments/:id/status — update a payment's status.
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentService.updatePaymentStatus(req.params.id as string, req.body);
  res.status(200).json({ data: payment });
});

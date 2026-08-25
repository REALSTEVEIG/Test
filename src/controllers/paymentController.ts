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
 * GET /payments — list payments (paginated via ?limit & ?offset).
 */
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query['limit'] !== undefined ? Number(req.query['limit']) : undefined;
  const offset = req.query['offset'] !== undefined ? Number(req.query['offset']) : undefined;

  const result = await paymentService.listPayments({ limit, offset });
  res.status(200).json({
    data: result.items,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      count: result.items.length,
    },
  });
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

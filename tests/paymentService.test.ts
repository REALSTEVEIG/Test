// Make processing fast and deterministic for the service unit tests.
process.env.PROCESSING_DELAY_MS = '10';
process.env.PAYMENT_FAILURE_RATE = '0';

import * as service from '../src/services/paymentService';
import * as store from '../src/store/paymentStore';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors/AppError';
import { PAYMENT_STATUS } from '../src/models/payment';

beforeEach(async () => {
  await store._reset();
});

describe('createPayment', () => {
  it('creates a PENDING payment then processes it to COMPLETED', async () => {
    const created = await service.createPayment({ amount: 20, currency: 'USD', method: 'card' });
    expect(created.status).toBe(PAYMENT_STATUS.PENDING);
    expect(created.id).toBeDefined();

    await service.waitForProcessing(created.id);

    const after = await service.getPaymentById(created.id);
    expect(after.status).toBe(PAYMENT_STATUS.COMPLETED);
    expect(after.processedAt).not.toBeNull();
  });

  it('throws ValidationError on invalid input', async () => {
    await expect(
      service.createPayment({ amount: -1, currency: 'USD', method: 'card' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getPaymentById', () => {
  it('throws NotFoundError for unknown id', async () => {
    await expect(service.getPaymentById('does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updatePaymentStatus', () => {
  it('updates status following an allowed transition', async () => {
    const created = await service.createPayment({ amount: 30, currency: 'EUR', method: 'card' });
    await service.waitForProcessing(created.id);

    const refunded = await service.updatePaymentStatus(created.id, { status: 'REFUNDED' });
    expect(refunded.status).toBe(PAYMENT_STATUS.REFUNDED);
  });

  it('rejects an illegal transition with ConflictError', async () => {
    const created = await service.createPayment({ amount: 30, currency: 'EUR', method: 'card' });
    await service.waitForProcessing(created.id);
    // COMPLETED -> PENDING is illegal.
    await expect(
      service.updatePaymentStatus(created.id, { status: 'PENDING' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError updating an unknown payment', async () => {
    await expect(
      service.updatePaymentStatus('nope', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listPayments', () => {
  it('returns all created payments with pagination metadata', async () => {
    await service.createPayment({ amount: 1, currency: 'USD', method: 'card' });
    await service.createPayment({ amount: 2, currency: 'USD', method: 'card' });
    await service.waitForProcessing();
    const page = await service.listPayments();
    expect(page.items.length).toBe(2);
    expect(page.total).toBe(2);
    expect(page.limit).toBe(20);
    expect(page.offset).toBe(0);
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createPayment({ amount: i + 1, currency: 'USD', method: 'card' });
    }
    await service.waitForProcessing();
    const page = await service.listPayments({ limit: 2, offset: 2 });
    expect(page.items.length).toBe(2);
    expect(page.total).toBe(5);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(2);
  });

  it('clamps an out-of-range limit', async () => {
    await service.createPayment({ amount: 1, currency: 'USD', method: 'card' });
    await service.waitForProcessing();
    const page = await service.listPayments({ limit: 9999 });
    expect(page.limit).toBe(100);
  });
});

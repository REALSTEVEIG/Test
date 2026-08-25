// Long processing delay so the manual update deterministically lands while the
// payment is still PENDING (before the background task moves it to PROCESSING).
process.env.PROCESSING_DELAY_MS = '300';
process.env.PAYMENT_FAILURE_RATE = '0';

import * as service from '../src/services/paymentService';
import * as store from '../src/store/paymentStore';
import { KeyedMutex } from '../src/utils/mutex';
import { PAYMENT_STATUS } from '../src/models/payment';

beforeEach(async () => {
  await store._reset();
});

describe('status update vs. background processing race', () => {
  it('keeps the payment in a consistent state when a cancel races processing', async () => {
    const created = await service.createPayment({ amount: 10, currency: 'USD', method: 'card' });

    // Attempt to cancel. Depending on scheduling this may succeed (cancel wins
    // while PENDING) or be rejected with a ConflictError (processing already
    // moved it to PROCESSING). Both are correct; what must never happen is a
    // lost update or an illegal state.
    let cancelled: boolean;
    try {
      await service.updatePaymentStatus(created.id, { status: 'CANCELLED' });
      cancelled = true;
    } catch {
      cancelled = false;
    }

    await service.waitForProcessing(created.id);
    const after = await service.getPaymentById(created.id);

    if (cancelled) {
      // The background task must not resurrect a cancelled payment.
      expect(after.status).toBe(PAYMENT_STATUS.CANCELLED);
    } else {
      // Otherwise it settled normally.
      expect([PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.FAILED]).toContain(after.status);
    }
  });

  it('does not lose the final settlement under normal flow', async () => {
    const created = await service.createPayment({ amount: 10, currency: 'USD', method: 'card' });
    await service.waitForProcessing(created.id);
    const after = await service.getPaymentById(created.id);
    expect(after.status).toBe(PAYMENT_STATUS.COMPLETED);
  });
});

describe('KeyedMutex', () => {
  it('serializes critical sections for the same key', async () => {
    const mutex = new KeyedMutex();
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;

    const task = (n: number) =>
      mutex.runExclusive('k', async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        order.push(n);
        active--;
      });

    await Promise.all([task(1), task(2), task(3)]);

    expect(maxActive).toBe(1); // never ran concurrently
    expect(order).toEqual([1, 2, 3]); // FIFO
  });

  it('allows different keys to run concurrently', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let maxActive = 0;

    const task = (key: string) =>
      mutex.runExclusive(key, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });

    await Promise.all([task('a'), task('b'), task('c')]);
    expect(maxActive).toBeGreaterThan(1);
  });
});

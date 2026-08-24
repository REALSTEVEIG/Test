// Force every simulated gateway call to fail, in an isolated test module so the
// module-load-time FAILURE_RATE is deterministic.
process.env.PROCESSING_DELAY_MS = '10';
process.env.PAYMENT_FAILURE_RATE = '1';

import * as service from '../src/services/paymentService';
import * as store from '../src/store/paymentStore';
import { PAYMENT_STATUS } from '../src/models/payment';

beforeEach(async () => {
  await store._reset();
});

describe('createPayment (forced gateway failure)', () => {
  it('marks the payment FAILED with a failureReason', async () => {
    const created = await service.createPayment({ amount: 5, currency: 'USD', method: 'card' });
    await service.waitForProcessing(created.id);

    const after = await service.getPaymentById(created.id);
    expect(after.status).toBe(PAYMENT_STATUS.FAILED);
    expect(after.failureReason).toBe('Simulated gateway decline');
  });
});

// Fast, deterministic processing for API tests.
process.env.PROCESSING_DELAY_MS = '10';
process.env.PAYMENT_FAILURE_RATE = '0';

import request from 'supertest';
import { createApp } from '../src/app';
import * as store from '../src/store/paymentStore';
import * as service from '../src/services/paymentService';

const app = createApp();

beforeEach(async () => {
  await store._reset();
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /payments', () => {
  it('creates a payment and returns 201 with PENDING status', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ amount: 99.99, currency: 'USD', method: 'card', description: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      amount: 99.99,
      currency: 'USD',
      method: 'card',
      status: 'PENDING',
    });
    expect(res.body.data.id).toBeDefined();
  });

  it('returns 400 with details on invalid input', async () => {
    const res = await request(app).post('/payments').send({ currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Content-Type', 'application/json')
      .send('{ bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const huge = { amount: 1, currency: 'USD', method: 'card', description: 'x'.repeat(200_000) };
    const res = await request(app).post('/payments').send(huge);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('GET /payments/:id', () => {
  it('retrieves an existing payment', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'GBP', method: 'card' });
    const id = created.body.data.id;

    const res = await request(app).get(`/payments/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/payments/unknown-id');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('reflects COMPLETED status after processing settles', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'USD', method: 'card' });
    const id = created.body.data.id;

    await service.waitForProcessing(id);

    const res = await request(app).get(`/payments/${id}`);
    expect(res.body.data.status).toBe('COMPLETED');
  });
});

describe('PATCH /payments/:id/status', () => {
  it('updates status via an allowed transition', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'USD', method: 'card' });
    const id = created.body.data.id;
    await service.waitForProcessing(id);

    const res = await request(app).patch(`/payments/${id}/status`).send({ status: 'REFUNDED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REFUNDED');
  });

  it('returns 409 for an illegal transition', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'USD', method: 'card' });
    const id = created.body.data.id;
    await service.waitForProcessing(id);

    const res = await request(app).patch(`/payments/${id}/status`).send({ status: 'PENDING' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 for an invalid status value', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'USD', method: 'card' });
    const id = created.body.data.id;

    const res = await request(app).patch(`/payments/${id}/status`).send({ status: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  it('returns 404 updating an unknown payment', async () => {
    const res = await request(app).patch('/payments/nope/status').send({ status: 'COMPLETED' });
    expect(res.status).toBe(404);
  });

  it('supports PUT as an alias', async () => {
    const created = await request(app)
      .post('/payments')
      .send({ amount: 10, currency: 'USD', method: 'card' });
    const id = created.body.data.id;
    await service.waitForProcessing(id);

    const res = await request(app).put(`/payments/${id}/status`).send({ status: 'REFUNDED' });
    expect(res.status).toBe(200);
  });
});

describe('GET /payments', () => {
  it('lists payments with a count', async () => {
    await request(app).post('/payments').send({ amount: 1, currency: 'USD', method: 'card' });
    await request(app).post('/payments').send({ amount: 2, currency: 'USD', method: 'card' });
    await service.waitForProcessing();

    const res = await request(app).get('/payments');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.data.length).toBe(2);
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON for unmatched route', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

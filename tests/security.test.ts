process.env.PROCESSING_DELAY_MS = '10';
process.env.PAYMENT_FAILURE_RATE = '0';
// Tight rate limit so the test is fast and deterministic.
process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

import request from 'supertest';
import { createApp } from '../src/app';
import * as store from '../src/store/paymentStore';

const app = createApp();

beforeEach(async () => {
  await store._reset();
});

describe('security headers', () => {
  it('sets helmet security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // helmet sets these by default
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 after exceeding the limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/payments');
      codes.push(res.status);
    }
    // First 3 allowed, later ones limited.
    expect(codes.filter((c) => c === 200).length).toBe(3);
    expect(codes).toContain(429);
  });

  it('does not rate-limit the health check', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });
});

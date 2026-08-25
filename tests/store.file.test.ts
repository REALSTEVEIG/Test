import os from 'os';
import path from 'path';
import fs from 'fs/promises';

// Configure file persistence in a temp dir BEFORE importing the store.
const TMP_DIR = path.join(os.tmpdir(), `payment-store-${process.pid}-${Date.now()}`);
process.env.PERSISTENCE = 'file';
process.env.DATA_DIR = TMP_DIR;

import * as store from '../src/store/paymentStore';
import type { Payment } from '../src/types';

function makePayment(id: string): Payment {
  const now = new Date().toISOString();
  return {
    id,
    amount: 10,
    currency: 'USD',
    method: 'card',
    description: null,
    metadata: {},
    status: 'PENDING',
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    processedAt: null,
  };
}

beforeEach(async () => {
  await store._reset();
});

afterAll(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe('file-based store', () => {
  it('persists a payment to disk and reads it back', async () => {
    await store.create(makePayment('a'));
    const raw = await fs.readFile(path.join(TMP_DIR, 'payments.json'), 'utf8');
    const arr = JSON.parse(raw);
    expect(arr).toHaveLength(1);
    expect(arr[0].id).toBe('a');
  });

  it('handles many concurrent writes without corrupting the file', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.create(makePayment(`p${i}`))));

    // File must be valid JSON with all records.
    const raw = await fs.readFile(path.join(TMP_DIR, 'payments.json'), 'utf8');
    const arr = JSON.parse(raw);
    expect(arr).toHaveLength(25);

    const page = await store.list({ limit: 100, offset: 0 });
    expect(page.total).toBe(25);
  });

  it('does not leave temp files behind', async () => {
    await store.create(makePayment('x'));
    const files = await fs.readdir(TMP_DIR);
    const temps = files.filter((f) => f.includes('.tmp'));
    expect(temps).toHaveLength(0);
  });
});

import {
  PAYMENT_STATUS,
  canTransition,
  validateCreateInput,
  validateStatusUpdateInput,
} from '../src/models/payment';
import { ValidationError } from '../src/errors/AppError';

describe('validateCreateInput', () => {
  it('accepts a valid payload and normalizes currency', () => {
    const result = validateCreateInput({ amount: 10.5, currency: 'usd', method: ' card ' });
    expect(result).toMatchObject({ amount: 10.5, currency: 'USD', method: 'card' });
  });

  it('rejects missing amount', () => {
    expect(() => validateCreateInput({ currency: 'USD', method: 'card' })).toThrow(ValidationError);
  });

  it('rejects non-positive amount', () => {
    expect(() => validateCreateInput({ amount: 0, currency: 'USD', method: 'card' })).toThrow(
      ValidationError,
    );
    expect(() => validateCreateInput({ amount: -5, currency: 'USD', method: 'card' })).toThrow(
      ValidationError,
    );
  });

  it('rejects amounts with more than 2 decimal places', () => {
    expect(() => validateCreateInput({ amount: 1.999, currency: 'USD', method: 'card' })).toThrow(
      ValidationError,
    );
  });

  it('rejects unsupported currency', () => {
    expect(() => validateCreateInput({ amount: 5, currency: 'XYZ', method: 'card' })).toThrow(
      ValidationError,
    );
  });

  it('rejects missing method', () => {
    expect(() => validateCreateInput({ amount: 5, currency: 'USD' })).toThrow(ValidationError);
  });

  it('collects multiple field errors in details', () => {
    try {
      validateCreateInput({});
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const details = (err as ValidationError).details;
      expect(Array.isArray(details)).toBe(true);
      expect((details as unknown[]).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('validateStatusUpdateInput', () => {
  it('accepts and uppercases a valid status', () => {
    expect(validateStatusUpdateInput({ status: 'completed' })).toEqual({ status: 'COMPLETED' });
  });

  it('rejects an unknown status', () => {
    expect(() => validateStatusUpdateInput({ status: 'NOPE' })).toThrow(ValidationError);
  });

  it('rejects a missing status', () => {
    expect(() => validateStatusUpdateInput({})).toThrow(ValidationError);
  });
});

describe('canTransition', () => {
  it('allows PENDING -> COMPLETED', () => {
    expect(canTransition(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.COMPLETED)).toBe(true);
  });

  it('disallows COMPLETED -> PENDING', () => {
    expect(canTransition(PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.PENDING)).toBe(false);
  });

  it('allows COMPLETED -> REFUNDED', () => {
    expect(canTransition(PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.REFUNDED)).toBe(true);
  });

  it('allows same-status no-op', () => {
    expect(canTransition(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.PROCESSING)).toBe(true);
  });
});

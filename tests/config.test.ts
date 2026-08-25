import { getConfig, _resetConfig, ConfigError } from '../src/config';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  _resetConfig();
});

describe('config validation', () => {
  it('applies sensible defaults', () => {
    delete process.env.PORT;
    delete process.env.PROCESSING_DELAY_MS;
    delete process.env.PAYMENT_FAILURE_RATE;
    _resetConfig();
    const cfg = getConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.persistence).toBe('memory');
    expect(cfg.failureRate).toBeCloseTo(0.15);
  });

  it('rejects an out-of-range PORT', () => {
    process.env.PORT = '99999';
    _resetConfig();
    expect(() => getConfig()).toThrow(ConfigError);
  });

  it('rejects a non-numeric PORT', () => {
    process.env.PORT = 'abc';
    _resetConfig();
    expect(() => getConfig()).toThrow(ConfigError);
  });

  it('rejects a failure rate above 1', () => {
    process.env.PAYMENT_FAILURE_RATE = '2';
    _resetConfig();
    expect(() => getConfig()).toThrow(ConfigError);
  });

  it('rejects an invalid PERSISTENCE value', () => {
    process.env.PERSISTENCE = 'postgres';
    _resetConfig();
    expect(() => getConfig()).toThrow(ConfigError);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'verbose';
    _resetConfig();
    expect(() => getConfig()).toThrow(ConfigError);
  });
});

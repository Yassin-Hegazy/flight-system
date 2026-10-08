import { describe, expect, it } from 'vitest';
import { LogLevel, NodeEnv, validateEnv } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

describe('validateEnv', () => {
  it('converts values read from the environment (always strings) to their types', () => {
    const env = validateEnv({ DATABASE_URL, PORT: '4000', LOG_LEVEL: 'debug' });

    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe(LogLevel.Debug);
  });

  it('applies defaults for optional variables', () => {
    const env = validateEnv({ DATABASE_URL });

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.LOG_LEVEL).toBe(LogLevel.Info);
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when PORT is not a valid port number', () => {
    expect(() => validateEnv({ DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
  });
});

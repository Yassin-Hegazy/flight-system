import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../modules/users-access/index';
import { DEMO_ACCOUNTS, shouldSeedAccounts } from './seed-accounts';

describe('NFR-PORT-01 demo accounts for trying the site', () => {
  it('NFR-PORT-01-T22 there are five travelers and five administrators, each with its own email', () => {
    const roles = DEMO_ACCOUNTS.map(({ role }) => role);
    expect(roles.filter((role) => role === 'TRAVELER')).toHaveLength(5);
    expect(roles.filter((role) => role === 'ADMIN')).toHaveLength(5);
    const emails = DEMO_ACCOUNTS.map(({ email }) => email.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('NFR-PORT-01-T23 every password passes the same rule registration uses', () => {
    for (const { email, password } of DEMO_ACCOUNTS) {
      expect({ email, problem: passwordProblem(password) }).toEqual({ email, problem: null });
    }
  });

  it('NFR-PORT-01-T24 the public demo passwords are never seeded in production unless asked for', () => {
    expect(shouldSeedAccounts({})).toBe(true);
    expect(shouldSeedAccounts({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldSeedAccounts({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldSeedAccounts({ NODE_ENV: 'production', SEED_DEMO_ACCOUNTS: 'true' })).toBe(true);
    expect(shouldSeedAccounts({ SEED_DEMO_ACCOUNTS: 'false' })).toBe(false);
  });
});

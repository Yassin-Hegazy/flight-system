import { describe, expect, it } from 'vitest';
import { lockedUntil, normalizeEmail, passwordProblem } from './users-access.domain';

describe('US-USR-04 Register an account (rules)', () => {
  it('US-USR-04-T06 emails are compared lower-case and without surrounding spaces', () => {
    expect(normalizeEmail('  ALI@Example.COM ')).toBe('ali@example.com');
  });

  it('US-USR-04-T07 boundary: 9 characters is too short, 10 is accepted, over 72 bytes is too long', () => {
    expect(passwordProblem('a'.repeat(9))).toMatch(/at least 10/);
    expect(passwordProblem('a'.repeat(10))).toBeNull();
    expect(passwordProblem('a'.repeat(72))).toBeNull();
    expect(passwordProblem('a'.repeat(73))).toMatch(/72 bytes/);
    // Multi-byte characters count by bytes: 37 Arabic letters are 74 bytes.
    expect(passwordProblem('ب'.repeat(37))).toMatch(/72 bytes/);
  });
});

describe('US-USR-05 lockout rule', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 7, 10, minute));

  it('US-USR-05-T09 four failures never lock; five within 15 minutes lock for 15 from the fifth', () => {
    expect(lockedUntil([at(0), at(1), at(2), at(3)])).toBeNull();
    expect(lockedUntil([at(0), at(1), at(2), at(3), at(4)])).toEqual(at(19));
  });

  it('US-USR-05-T10 five failures spread over more than 15 minutes do not lock', () => {
    expect(lockedUntil([at(0), at(4), at(8), at(12), at(16)])).toBeNull();
  });
});

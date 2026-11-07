import { describe, expect, it } from 'vitest';
import { normalizeEmail, passwordProblem } from './users-access.domain';

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

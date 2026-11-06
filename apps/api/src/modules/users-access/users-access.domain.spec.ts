import { describe, expect, it, vi } from 'vitest';
import { UserRole, normalizeEmail, validatePassword, withOwnership, withRole } from './users-access.domain';

describe('users access domain', () => {
  it('normalizes email and enforces the password boundary', () => {
    expect(normalizeEmail('  ALI@Example.COM ')).toBe('ali@example.com');
    expect(validatePassword('short')).toBeTruthy();
    expect(validatePassword('a'.repeat(10))).toBeNull();
    expect(validatePassword('a'.repeat(73))).toBeTruthy();
  });

  it('rejects non-admin users before an administrative use case runs', () => {
    const useCase = vi.fn(() => Promise.resolve('changed'));
    const wrapped = withRole(UserRole.Admin, useCase, {
      id: 'u1', email: 'a@example.com', name: 'A', role: UserRole.Traveler,
    });
    expect(() => wrapped()).toThrow('FORBIDDEN');
    expect(useCase).not.toHaveBeenCalled();
  });

  it('returns not-found for a resource owned by another user', () => {
    const wrapped = withOwnership(
      () => Promise.resolve({ ownerId: 'owner-a', value: 'secret' }),
      () => Promise.resolve('read'),
      { id: 'owner-b', email: 'b@example.com', name: 'B', role: UserRole.Traveler },
    );
    return expect(wrapped('record')).rejects.toThrow('NOT_FOUND');
  });
});

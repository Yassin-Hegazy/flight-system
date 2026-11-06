import { describe, expect, it, vi } from 'vitest';
import { UserRole, normalizeEmail, validatePassword, withOwnership, withRole } from './users-access.domain';

describe('users access domain', () => {
  it('normalizes email and enforces the password boundary', () => {
    expect(normalizeEmail('  ALI@Example.COM ')).toBe('ali@example.com');
    expect(validatePassword('short')).toBeTruthy();
    expect(validatePassword('a'.repeat(10))).toBeNull();
    expect(validatePassword('a'.repeat(73))).toBeTruthy();
  });

  it('rejects non-admin users before an administrative use case runs', async () => {
    const useCase = vi.fn(async () => 'changed');
    const wrapped = withRole(UserRole.Admin, useCase, {
      id: 'u1', email: 'a@example.com', name: 'A', role: UserRole.Traveler,
    });
    expect(() => wrapped()).toThrow('FORBIDDEN');
    expect(useCase).not.toHaveBeenCalled();
  });

  it('returns not-found for a resource owned by another user', async () => {
    const wrapped = withOwnership(
      async () => ({ ownerId: 'owner-a', value: 'secret' }),
      async () => 'read',
      { id: 'owner-b', email: 'b@example.com', name: 'B', role: UserRole.Traveler },
    );
    await expect(wrapped('record')).rejects.toThrow('NOT_FOUND');
  });
});

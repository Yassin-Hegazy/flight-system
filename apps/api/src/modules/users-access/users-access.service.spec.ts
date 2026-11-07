import { describe, expect, it } from 'vitest';
import { usersService } from './test-support';
import { UserRole } from './users-access.domain';

const ALICE = { email: 'Alice@Example.com', password: 'correct horse', name: 'Alice' };

describe('US-USR-04 Register an account (service)', () => {
  it('US-USR-04-T04 stores the email lower-cased, a hash instead of the password, and the TRAVELER role', async () => {
    const { repository, service } = usersService();

    const result = await service.register(ALICE);

    if (!result.ok) throw new Error(result.error);
    const stored = await repository.findUserById(result.value);
    expect(stored).toMatchObject({ email: 'alice@example.com', role: UserRole.Traveler });
    expect(stored?.passwordHash).not.toBe(ALICE.password);
  });
});

describe('US-USR-05 Sign in and sign out (service)', () => {
  it('US-USR-05-T04 a signed-in token resolves to its user until it is signed out', async () => {
    const { service } = usersService();
    await service.register(ALICE);

    const signedIn = await service.signIn('alice@example.com', ALICE.password);
    if (!signedIn.ok) throw new Error(signedIn.error);

    expect((await service.currentUser(signedIn.value))?.email).toBe('alice@example.com');
    await service.signOut(signedIn.value);
    expect(await service.currentUser(signedIn.value)).toBeNull();
  });

  it('US-USR-05-T05 a session expires after 24 hours without activity', async () => {
    const { clock, service } = usersService();
    await service.register(ALICE);
    const signedIn = await service.signIn('alice@example.com', ALICE.password);
    if (!signedIn.ok) throw new Error(signedIn.error);

    clock.advanceMinutes(23 * 60);
    expect(await service.currentUser(signedIn.value)).not.toBeNull();
    clock.advanceMinutes(24 * 60 + 1);
    expect(await service.currentUser(signedIn.value)).toBeNull();
  });
});

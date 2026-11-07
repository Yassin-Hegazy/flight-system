import { describe, expect, it } from 'vitest';
import { fakeHasher, usersService } from './test-support';
import { UsersAccessService } from './users-access.service';
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

describe('US-USR-05 sign-in lockout and timing', () => {
  async function failFiveTimesFrom(start: string) {
    const context = usersService(start);
    await context.service.register(ALICE);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await context.service.signIn(ALICE.email, 'wrong password!');
      // Attempts 1 to 5 are still checked: the 5th is a plain wrong password, not a lock.
      expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
      context.clock.advanceMinutes(1);
    }
    return context;
  }

  it('US-USR-05-T03 boundary: the 5th failure is still checked, the 6th attempt is refused', async () => {
    const { service } = await failFiveTimesFrom('2026-11-07T10:00:00Z');
    // 10:05: five failures (10:00 to 10:04) within 15 minutes.
    expect(await service.signIn(ALICE.email, ALICE.password)).toEqual({
      ok: false,
      error: 'LOCKED',
    });
  });

  it('US-USR-05-T07 the lock lasts 15 minutes from the 5th failure, not from the 1st', async () => {
    const { clock, service } = await failFiveTimesFrom('2026-11-07T10:00:00Z');

    clock.set('2026-11-07T10:16:00Z');
    expect(await service.signIn(ALICE.email, ALICE.password)).toEqual({
      ok: false,
      error: 'LOCKED',
    });

    clock.set('2026-11-07T10:19:01Z');
    expect((await service.signIn(ALICE.email, ALICE.password)).ok).toBe(true);
  });

  it('US-USR-05-T08 an unknown email costs the same password check as a wrong password', async () => {
    const { repository, clock } = usersService();
    let verifications = 0;
    const countingHasher = {
      hash: (password: string) => fakeHasher.hash(password),
      verify: (hash: string, password: string) => {
        verifications += 1;
        return fakeHasher.verify(hash, password);
      },
    };
    const service = new UsersAccessService(repository, countingHasher, clock);

    await service.signIn('nobody@example.com', 'whatever password');

    expect(verifications).toBe(1);
  });
});

describe('US-USR-05 failed-attempt records do not grow without bound', () => {
  it("US-USR-05-T11 recording a failure deletes that email's failures too old to affect a lock", async () => {
    const { clock, repository, service } = usersService('2026-11-07T09:00:00Z');
    await service.signIn('alice@example.com', 'wrong password!');

    clock.set('2026-11-07T10:00:00Z');
    await service.signIn('alice@example.com', 'wrong password!');

    expect(repository.attempts.map((attempt) => attempt.at.toISOString())).toEqual([
      '2026-11-07T10:00:00.000Z',
    ]);
  });

  it("US-USR-05-T12 a successful sign-in clears the email's failures", async () => {
    const { repository, service } = usersService();
    await service.register(ALICE);
    await service.signIn(ALICE.email, 'wrong password!');

    expect((await service.signIn(ALICE.email, ALICE.password)).ok).toBe(true);
    expect(repository.attempts).toEqual([]);
  });
});

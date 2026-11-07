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

describe('US-USR-02 / US-USR-07 / US-USR-06 account use cases', () => {
  async function registered() {
    const context = usersService();
    const result = await context.service.register(ALICE);
    if (!result.ok) throw new Error(result.error);
    return { ...context, userId: result.value };
  }

  it('US-USR-04-T10 rejects a weak password and a taken email; createAdmin creates an ADMIN', async () => {
    const { repository, service } = await registered();
    expect(await service.register({ ...ALICE, password: 'short' })).toEqual({
      ok: false,
      error: 'WEAK_PASSWORD',
    });
    expect(await service.register({ ...ALICE, email: 'ALICE@example.com' })).toEqual({
      ok: false,
      error: 'EMAIL_TAKEN',
    });
    const admin = await service.createAdmin({ ...ALICE, email: 'ops@example.com' });
    if (!admin.ok) throw new Error(admin.error);
    expect((await repository.findUserById(admin.value))?.role).toBe(UserRole.Admin);
  });

  it('US-USR-02-T04 an email change needs the right current password and a free address', async () => {
    const { service, userId } = await registered();
    await service.register({ ...ALICE, email: 'taken@example.com' });

    expect(await service.updateProfile(userId, { email: 'new@example.com' })).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', fieldErrors: { currentPassword: expect.any(String) } },
    });
    expect(
      await service.updateProfile(userId, { email: 'new@example.com', currentPassword: 'nope' }),
    ).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', fieldErrors: { currentPassword: expect.any(String) } },
    });
    expect(
      await service.updateProfile(userId, {
        email: 'Taken@Example.com',
        currentPassword: ALICE.password,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'EMAIL_TAKEN', fieldErrors: { email: expect.any(String) } },
    });
  });

  it('US-USR-02-T05 name, phone and email update together; re-sending the same email needs no password', async () => {
    const { repository, service, userId } = await registered();
    expect(
      await service.updateProfile(userId, {
        name: '  Alice B ',
        phone: '+20 100 000 0000',
        email: 'alice@example.com',
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await repository.findUserById(userId)).toMatchObject({
      name: 'Alice B',
      phone: '+20 100 000 0000',
      email: 'alice@example.com',
    });
  });

  it('US-USR-07-T03 a password change needs the current password and a strong new one', async () => {
    const { service, userId } = await registered();
    expect(await service.changePassword(userId, 'wrong', 'a new long password')).toEqual({
      ok: false,
      error: 'INVALID_CURRENT',
    });
    expect(await service.changePassword(userId, ALICE.password, 'short')).toEqual({
      ok: false,
      error: 'WEAK_PASSWORD',
    });
    expect((await service.changePassword(userId, ALICE.password, 'a new long password')).ok).toBe(
      true,
    );
    expect((await service.signIn(ALICE.email, 'a new long password')).ok).toBe(true);
  });

  it('US-USR-06-T04 saved travelers: add up to 10, edit and delete only your own', async () => {
    const { service, userId } = await registered();
    const traveler = { name: '  Child ', dateOfBirth: '2015-01-01' };
    const added = await service.addSavedTraveler(userId, traveler);
    if (!added.ok) throw new Error(added.error);
    expect(added.value.name).toBe('Child');

    expect(await service.updateSavedTraveler('someone-else', added.value.id, traveler)).toEqual({
      ok: false,
      error: 'SAVED_TRAVELER_NOT_FOUND',
    });
    expect(await service.deleteSavedTraveler('someone-else', added.value.id)).toEqual({
      ok: false,
      error: 'SAVED_TRAVELER_NOT_FOUND',
    });
    expect(
      (await service.updateSavedTraveler(userId, added.value.id, { ...traveler, name: 'Kid' })).ok,
    ).toBe(true);
    expect((await service.listSavedTravelers(userId)).map((saved) => saved.name)).toEqual(['Kid']);

    for (let i = 2; i <= 10; i += 1) await service.addSavedTraveler(userId, traveler);
    expect(await service.addSavedTraveler(userId, traveler)).toEqual({
      ok: false,
      error: 'SAVED_TRAVELER_LIMIT',
    });
    expect((await service.deleteSavedTraveler(userId, added.value.id)).ok).toBe(true);
  });

  it('US-USR-05-T13 no token, an unknown token, or a session whose user is gone resolves to nobody', async () => {
    const { repository, service } = await registered();
    expect(await service.currentUser(undefined)).toBeNull();
    expect(await service.currentUser('not-a-real-token')).toBeNull();
    const signedIn = await service.signIn(ALICE.email, ALICE.password);
    if (!signedIn.ok) throw new Error(signedIn.error);
    repository.users.clear();
    expect(await service.currentUser(signedIn.value)).toBeNull();
  });
});

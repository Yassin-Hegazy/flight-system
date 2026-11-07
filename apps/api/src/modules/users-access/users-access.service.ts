import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher';
import {
  LOCKOUT_DURATION_MS,
  LOCKOUT_WINDOW_MS,
  lockedUntil,
  type Principal,
  UserRole,
  normalizeEmail,
  passwordProblem,
} from './users-access.domain';
import type {
  ProfileError,
  ProfileInput,
  RegisterInput,
  SavedTraveler,
  SavedTravelerInput,
  UsersApi,
} from './users-api';
import { type UserRecord, USERS_REPOSITORY, type UsersRepository } from './users.repository';

const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const MAX_SAVED_TRAVELERS = 10;

/**
 * The Users and Access use cases. Field formats are checked by the DTOs at the boundary; these
 * methods apply the business rules and return expected failures as Result error codes.
 */
@Injectable()
export class UsersAccessService implements UsersApi {
  /** Verified against when the email is unknown, so both paths cost one password check. */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly repository: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  register(input: RegisterInput): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>> {
    // Self-registration always creates a traveler (US-USR-04 AC-2).
    return this.createUser(input, UserRole.Traveler);
  }

  createAdmin(input: RegisterInput): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>> {
    return this.createUser(input, UserRole.Admin);
  }

  async signIn(
    emailInput: string,
    password: string,
  ): Promise<Result<string, 'INVALID_CREDENTIALS' | 'LOCKED'>> {
    const email = normalizeEmail(emailInput);
    const now = this.clock.now();
    const lookback = new Date(now.getTime() - LOCKOUT_WINDOW_MS - LOCKOUT_DURATION_MS);
    const unlocksAt = lockedUntil(await this.repository.failedAttemptsSince(email, lookback));
    if (unlocksAt && unlocksAt > now) return err('LOCKED');

    const user = await this.repository.findUserByEmail(email);
    // Always one hash check, so the response time does not reveal whether the email exists.
    const hash = user?.passwordHash ?? (await this.timingDummyHash());
    const valid = await this.hasher.verify(hash, password);
    if (!user || !valid) {
      await this.repository.recordFailedAttempt(email, now);
      // Failures older than the lookback can no longer affect a lock.
      await this.repository.deleteFailedAttempts(email, lookback);
      return err('INVALID_CREDENTIALS');
    }
    await this.repository.deleteFailedAttempts(email);
    const token = randomBytes(32).toString('base64url');
    await this.repository.insertSession({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    });
    return ok(token);
  }

  async signOut(token: string): Promise<void> {
    await this.repository.deleteSession(hashToken(token));
  }

  async currentUser(token: string | undefined): Promise<Principal | null> {
    if (!token) return null;
    const now = this.clock.now();
    const session = await this.repository.findSession(hashToken(token));
    if (!session || session.expiresAt <= now) return null;
    const user = await this.repository.findUserById(session.userId);
    if (!user) return null;
    await this.repository.updateSession({
      ...session,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  /** A new email needs the current password and must not belong to another account (US-USR-02). */
  async updateProfile(userId: string, input: ProfileInput): Promise<Result<void, ProfileError>> {
    const user = await this.requireUser(userId);
    const newEmail = input.email !== undefined ? normalizeEmail(input.email) : undefined;
    if (newEmail !== undefined && newEmail !== user.email) {
      if (!input.currentPassword) {
        return err(invalid('currentPassword', 'Current password is required to change email'));
      }
      if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
        return err(invalid('currentPassword', 'Current password is incorrect'));
      }
      if (await this.repository.findUserByEmail(newEmail)) {
        return err({
          code: 'EMAIL_TAKEN',
          fieldErrors: { email: 'Email address is already in use' },
        });
      }
    }
    await this.repository.updateUser({
      ...user,
      name: input.name !== undefined ? input.name.trim() : user.name,
      phone: input.phone !== undefined ? input.phone.trim() : user.phone,
      email: newEmail ?? user.email,
    });
    return ok(undefined);
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
    keepSession?: string,
  ): Promise<Result<void, 'INVALID_CURRENT' | 'WEAK_PASSWORD'>> {
    const user = await this.requireUser(userId);
    if (!(await this.hasher.verify(user.passwordHash, current))) return err('INVALID_CURRENT');
    if (passwordProblem(next)) return err('WEAK_PASSWORD');
    await this.repository.updateUser({ ...user, passwordHash: await this.hasher.hash(next) });
    // If the password leaked, an attacker's session must end with it; this one stays signed in.
    await this.repository.deleteSessionsOfUser(
      userId,
      keepSession ? hashToken(keepSession) : undefined,
    );
    return ok(undefined);
  }

  listSavedTravelers(ownerId: string): Promise<SavedTraveler[]> {
    return this.repository.listSavedTravelers(ownerId);
  }

  async addSavedTraveler(
    ownerId: string,
    input: SavedTravelerInput,
  ): Promise<Result<SavedTraveler, 'SAVED_TRAVELER_LIMIT'>> {
    if ((await this.repository.countSavedTravelers(ownerId)) >= MAX_SAVED_TRAVELERS) {
      return err('SAVED_TRAVELER_LIMIT');
    }
    return ok(
      await this.repository.insertSavedTraveler({
        ownerId,
        name: input.name.trim(),
        dateOfBirth: input.dateOfBirth,
      }),
    );
  }

  /** Only the owner's own travelers are found; anyone else's look as if they do not exist. */
  async updateSavedTraveler(
    ownerId: string,
    id: string,
    input: SavedTravelerInput,
  ): Promise<Result<SavedTraveler, 'SAVED_TRAVELER_NOT_FOUND'>> {
    const updated = await this.repository.updateSavedTraveler({
      id,
      ownerId,
      name: input.name.trim(),
      dateOfBirth: input.dateOfBirth,
    });
    return updated ? ok(updated) : err('SAVED_TRAVELER_NOT_FOUND');
  }

  async deleteSavedTraveler(
    ownerId: string,
    id: string,
  ): Promise<Result<void, 'SAVED_TRAVELER_NOT_FOUND'>> {
    return (await this.repository.deleteSavedTraveler(ownerId, id))
      ? ok(undefined)
      : err('SAVED_TRAVELER_NOT_FOUND');
  }

  private async createUser(
    input: RegisterInput,
    role: UserRole,
  ): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>> {
    if (passwordProblem(input.password)) return err('WEAK_PASSWORD');
    const email = normalizeEmail(input.email);
    if (await this.repository.findUserByEmail(email)) return err('EMAIL_TAKEN');
    return this.repository.insertUser({
      email,
      passwordHash: await this.hasher.hash(input.password),
      name: input.name.trim(),
      phone: input.phone?.trim() ?? null,
      role,
    });
  }

  private timingDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }

  /** The signed-in user; a session for a deleted account is already rejected by currentUser. */
  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new Error(`User ${userId} has a session but no account`);
    return user;
  }
}

function invalid(field: string, message: string): ProfileError {
  return { code: 'VALIDATION_ERROR', fieldErrors: { [field]: message } };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

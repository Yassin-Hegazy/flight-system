import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher';
import {
  type Principal,
  UserRole,
  fieldErrors,
  normalizeEmail,
  validatePassword,
} from './users-access.domain';
import type {
  ProfileInput,
  RegisterInput,
  SavedTraveler,
  SavedTravelerInput,
  UsersApi,
} from './users-api';
import { USERS_REPOSITORY, type UsersRepository } from './users.repository';

export const SESSION_COOKIE = 'flight_session';
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_SAVED_TRAVELERS = 10;

/** The Users and Access use cases. SQL lives in the repository, hashing in the hasher. */
@Injectable()
export class UsersAccessService implements UsersApi {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repository: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: RegisterInput): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>> {
    const email = normalizeEmail(input.email);
    if (await this.repository.findUserByEmail(email)) return err('EMAIL_TAKEN');
    if (validatePassword(input.password)) return err('WEAK_PASSWORD');
    const errors = fieldErrors({ email, name: input.name, phone: input.phone });
    if (Object.keys(errors).length) {
      throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', fieldErrors: errors });
    }
    const id = await this.repository.insertUser({
      email,
      passwordHash: await this.hasher.hash(input.password),
      name: input.name.trim(),
      phone: input.phone?.trim() ?? null,
      role: UserRole.Traveler,
    });
    return ok(id);
  }

  async signIn(
    emailInput: string,
    password: string,
  ): Promise<Result<string, 'INVALID_CREDENTIALS' | 'LOCKED'>> {
    const email = normalizeEmail(emailInput);
    const now = this.clock.now();
    const since = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
    if ((await this.repository.countFailedAttempts(email, since)) >= MAX_FAILED_ATTEMPTS) {
      return err('LOCKED');
    }
    const user = await this.repository.findUserByEmail(email);
    const valid = user ? await this.hasher.verify(user.passwordHash, password) : false;
    if (!user || !valid) {
      await this.repository.recordFailedAttempt(email, now);
      return err('INVALID_CREDENTIALS');
    }
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

  async updateProfile(
    userId: string,
    input: ProfileInput,
  ): Promise<Result<void, Record<string, string>>> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    const errors = fieldErrors(input);
    if (input.email && !input.currentPassword) {
      errors.currentPassword = 'Current password is required to change email';
    }
    if (
      input.email &&
      input.currentPassword &&
      !(await this.hasher.verify(user.passwordHash, input.currentPassword))
    ) {
      errors.currentPassword = 'Current password is invalid';
    }
    if (
      input.email &&
      normalizeEmail(input.email) !== user.email &&
      (await this.repository.findUserByEmail(normalizeEmail(input.email)))
    ) {
      errors.email = 'Email address is already in use';
    }
    if (Object.keys(errors).length) return err(errors);
    await this.repository.updateUser({
      ...user,
      name: input.name !== undefined ? input.name.trim() : user.name,
      phone: input.phone !== undefined ? input.phone.trim() : user.phone,
      email: input.email !== undefined ? normalizeEmail(input.email) : user.email,
    });
    return ok(undefined);
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<Result<void, 'INVALID_CURRENT' | 'WEAK_PASSWORD'>> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!(await this.hasher.verify(user.passwordHash, current))) return err('INVALID_CURRENT');
    if (validatePassword(next)) return err('WEAK_PASSWORD');
    await this.repository.updateUser({ ...user, passwordHash: await this.hasher.hash(next) });
    await this.repository.deleteSessionsOfUser(userId);
    return ok(undefined);
  }

  listSavedTravelers(ownerId: string): Promise<SavedTraveler[]> {
    return this.repository.listSavedTravelers(ownerId);
  }

  async addSavedTraveler(ownerId: string, input: SavedTravelerInput): Promise<SavedTraveler> {
    if ((await this.repository.countSavedTravelers(ownerId)) >= MAX_SAVED_TRAVELERS) {
      throw new ConflictException('Saved traveler limit reached');
    }
    const errors = fieldErrors({ name: input.name });
    if (Object.keys(errors).length) {
      throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', fieldErrors: errors });
    }
    return this.repository.insertSavedTraveler({
      ownerId,
      name: input.name.trim(),
      dateOfBirth: input.dateOfBirth,
    });
  }

  async updateSavedTraveler(
    ownerId: string,
    id: string,
    input: SavedTravelerInput,
  ): Promise<SavedTraveler> {
    const updated = await this.repository.updateSavedTraveler({
      id,
      ownerId,
      name: input.name.trim(),
      dateOfBirth: input.dateOfBirth,
    });
    if (!updated) throw new NotFoundException('Saved traveler not found');
    return updated;
  }

  async deleteSavedTraveler(ownerId: string, id: string): Promise<void> {
    if (!(await this.repository.deleteSavedTraveler(ownerId, id))) {
      throw new NotFoundException('Saved traveler not found');
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

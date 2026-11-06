import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { LoginAttemptEntity } from './login-attempt.entity';
import { Principal, Result, UserRole, fieldErrors, normalizeEmail, validatePassword } from './users-access.domain';
import { SavedTravelerEntity } from './saved-traveler.entity';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';

export const SESSION_COOKIE = 'flight_session';
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UsersAccessService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(LoginAttemptEntity) private readonly attempts: Repository<LoginAttemptEntity>,
    @InjectRepository(SavedTravelerEntity) private readonly savedTravelers: Repository<SavedTravelerEntity>,
  ) {}

  async register(input: { email: string; password: string; name: string; phone?: string }): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>> {
    const email = normalizeEmail(input.email);
    if (await this.users.findOneBy({ email })) return { ok: false, error: 'EMAIL_TAKEN' };
    if (validatePassword(input.password)) return { ok: false, error: 'WEAK_PASSWORD' };
    const errors = fieldErrors({ email, name: input.name, phone: input.phone });
    if (Object.keys(errors).length) throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', fieldErrors: errors });
    const user = new UserEntity();
    user.email = email;
    user.passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    user.name = input.name.trim();
    user.phone = input.phone?.trim() ?? null;
    user.role = UserRole.Traveler;
    return { ok: true, value: (await this.users.save(user)).id };
  }

  async signIn(emailInput: string, password: string): Promise<Result<string, 'INVALID_CREDENTIALS' | 'LOCKED'>> {
    const email = normalizeEmail(emailInput);
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const failed = await this.attempts.count({ where: { email, attemptedAt: MoreThan(since) } });
    if (failed >= 5) return { ok: false, error: 'LOCKED' };
    const user = await this.users.findOneBy({ email });
    const valid = user ? await argon2.verify(user.passwordHash, password) : false;
    if (!user || !valid) {
      const attempt = new LoginAttemptEntity();
      attempt.email = email;
      attempt.attemptedAt = new Date();
      await this.attempts.save(attempt);
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session = new SessionEntity();
    session.tokenHash = this.hashToken(token);
    session.userId = user.id;
    session.createdAt = now;
    session.lastSeenAt = now;
    session.expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
    await this.sessions.save(session);
    return { ok: true, value: token };
  }

  async signOut(token: string): Promise<void> {
    await this.sessions.delete({ tokenHash: this.hashToken(token) });
  }

  async currentUser(token: string | undefined): Promise<Principal | null> {
    if (!token) return null;
    const session = await this.sessions.findOne({ where: { tokenHash: this.hashToken(token) } });
    if (!session || session.expiresAt <= new Date()) return null;
    const user = await this.users.findOneBy({ id: session.userId });
    if (!user) return null;
    session.lastSeenAt = new Date();
    session.expiresAt = new Date(Date.now() + SESSION_IDLE_MS);
    await this.sessions.save(session);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async updateProfile(userId: string, input: { name?: string; phone?: string; email?: string; currentPassword?: string }): Promise<Result<void, Record<string, string>>> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    const errors = fieldErrors(input);
    if (input.email && !input.currentPassword) errors.currentPassword = 'Current password is required to change email';
    if (input.email && input.currentPassword && !(await argon2.verify(user.passwordHash, input.currentPassword))) {
      errors.currentPassword = 'Current password is invalid';
    }
    if (input.email && normalizeEmail(input.email) !== user.email && await this.users.findOneBy({ email: normalizeEmail(input.email) })) {
      errors.email = 'Email address is already in use';
    }
    if (Object.keys(errors).length) return { ok: false, error: errors };
    if (input.name !== undefined) user.name = input.name.trim();
    if (input.phone !== undefined) user.phone = input.phone.trim();
    if (input.email !== undefined) user.email = normalizeEmail(input.email);
    await this.users.save(user);
    return { ok: true, value: undefined };
  }

  async changePassword(userId: string, current: string, next: string): Promise<Result<void, 'INVALID_CURRENT' | 'WEAK_PASSWORD'>> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    if (!(await argon2.verify(user.passwordHash, current))) return { ok: false, error: 'INVALID_CURRENT' };
    if (validatePassword(next)) return { ok: false, error: 'WEAK_PASSWORD' };
    user.passwordHash = await argon2.hash(next, { type: argon2.argon2id });
    await this.users.save(user);
    await this.sessions.delete({ userId });
    return { ok: true, value: undefined };
  }

  async listSavedTravelers(ownerId: string) {
    return this.savedTravelers.find({ where: { ownerId }, order: { name: 'ASC' } });
  }

  async addSavedTraveler(ownerId: string, input: { name: string; dateOfBirth: string }) {
    if ((await this.savedTravelers.count({ where: { ownerId } })) >= 10) {
      throw new ConflictException('Saved traveler limit reached');
    }
    const errors = fieldErrors({ name: input.name });
    if (Object.keys(errors).length) throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', fieldErrors: errors });
    const saved = new SavedTravelerEntity();
    saved.ownerId = ownerId;
    saved.name = input.name.trim();
    saved.dateOfBirth = input.dateOfBirth;
    return this.savedTravelers.save(saved);
  }

  async updateSavedTraveler(ownerId: string, id: string, input: { name: string; dateOfBirth: string }) {
    const saved = await this.savedTravelers.findOneBy({ id, ownerId });
    if (!saved) throw new NotFoundException('Saved traveler not found');
    saved.name = input.name.trim();
    saved.dateOfBirth = input.dateOfBirth;
    return this.savedTravelers.save(saved);
  }

  async deleteSavedTraveler(ownerId: string, id: string) {
    const result = await this.savedTravelers.delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException('Saved traveler not found');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

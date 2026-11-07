import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, MoreThan, Not } from 'typeorm';
import { isUniqueViolation } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import { LoginAttemptEntity } from './login-attempt.entity';
import { SavedTravelerEntity } from './saved-traveler.entity';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';
import type {
  NewUserRecord,
  SavedTravelerRecord,
  SessionRecord,
  UserRecord,
  UsersRepository,
} from './users.repository';

/** PostgreSQL implementation of UsersRepository: the only file with SQL for this module's tables. */
@Injectable()
export class PgUsersRepository implements UsersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get db(): EntityManager {
    return this.dataSource.manager;
  }

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.db.findOne(UserEntity, { where: { email } });
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.db.findOne(UserEntity, { where: { id } });
  }

  async insertUser(user: NewUserRecord): Promise<Result<string, 'EMAIL_TAKEN'>> {
    try {
      const saved = await this.db.save(UserEntity, { ...user });
      return ok(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) return err('EMAIL_TAKEN');
      throw error;
    }
  }

  async updateUser(user: UserRecord): Promise<void> {
    await this.db.update(UserEntity, { id: user.id }, { ...user });
  }

  async failedAttemptsSince(email: string, since: Date): Promise<Date[]> {
    const rows = await this.db.find(LoginAttemptEntity, {
      where: { email, attemptedAt: MoreThan(since) },
      order: { attemptedAt: 'ASC' },
    });
    return rows.map((row) => row.attemptedAt);
  }

  async recordFailedAttempt(email: string, at: Date): Promise<void> {
    await this.db.insert(LoginAttemptEntity, { email, attemptedAt: at });
  }

  async insertSession(session: SessionRecord): Promise<void> {
    await this.db.insert(SessionEntity, { ...session });
  }

  findSession(tokenHash: string): Promise<SessionRecord | null> {
    return this.db.findOne(SessionEntity, { where: { tokenHash } });
  }

  async updateSession(session: SessionRecord): Promise<void> {
    await this.db.update(
      SessionEntity,
      { tokenHash: session.tokenHash },
      { lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt },
    );
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.delete(SessionEntity, { tokenHash });
  }

  async deleteSessionsOfUser(userId: string, exceptTokenHash?: string): Promise<void> {
    await this.db.delete(
      SessionEntity,
      exceptTokenHash ? { userId, tokenHash: Not(exceptTokenHash) } : { userId },
    );
  }

  listSavedTravelers(ownerId: string): Promise<SavedTravelerRecord[]> {
    return this.db.find(SavedTravelerEntity, { where: { ownerId }, order: { name: 'ASC' } });
  }

  countSavedTravelers(ownerId: string): Promise<number> {
    return this.db.count(SavedTravelerEntity, { where: { ownerId } });
  }

  insertSavedTraveler(traveler: Omit<SavedTravelerRecord, 'id'>): Promise<SavedTravelerRecord> {
    return this.db.save(SavedTravelerEntity, { ...traveler });
  }

  async updateSavedTraveler(traveler: SavedTravelerRecord): Promise<SavedTravelerRecord | null> {
    const result = await this.db.update(
      SavedTravelerEntity,
      { id: traveler.id, ownerId: traveler.ownerId },
      { name: traveler.name, dateOfBirth: traveler.dateOfBirth },
    );
    return result.affected ? traveler : null;
  }

  async deleteSavedTraveler(ownerId: string, id: string): Promise<boolean> {
    const result = await this.db.delete(SavedTravelerEntity, { id, ownerId });
    return !!result.affected;
  }
}

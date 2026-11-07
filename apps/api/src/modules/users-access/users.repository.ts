import type { UserRole } from './users-access.domain';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  role: UserRole;
}

export type NewUserRecord = Omit<UserRecord, 'id'>;

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface SavedTravelerRecord {
  id: string;
  ownerId: string;
  name: string;
  dateOfBirth: string;
}

/**
 * Everything Users and Access needs from storage (Repository pattern). PgUsersRepository is the
 * only file with SQL for this module's tables; InMemoryUsersRepository replaces it in unit tests.
 */
export interface UsersRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  insertUser(user: NewUserRecord): Promise<string>;
  updateUser(user: UserRecord): Promise<void>;

  /** Failed sign-in times for an email since a given instant, oldest first. */
  failedAttemptsSince(email: string, since: Date): Promise<Date[]>;
  recordFailedAttempt(email: string, at: Date): Promise<void>;

  insertSession(session: SessionRecord): Promise<void>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  updateSession(session: SessionRecord): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsOfUser(userId: string): Promise<void>;

  listSavedTravelers(ownerId: string): Promise<SavedTravelerRecord[]>;
  countSavedTravelers(ownerId: string): Promise<number>;
  insertSavedTraveler(traveler: Omit<SavedTravelerRecord, 'id'>): Promise<SavedTravelerRecord>;
  /** Updates the traveler only if it belongs to ownerId; returns null when it does not. */
  updateSavedTraveler(traveler: SavedTravelerRecord): Promise<SavedTravelerRecord | null>;
  /** Deletes the traveler only if it belongs to ownerId; returns whether anything was deleted. */
  deleteSavedTraveler(ownerId: string, id: string): Promise<boolean>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

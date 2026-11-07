import { randomUUID } from 'node:crypto';
import type {
  NewUserRecord,
  SavedTravelerRecord,
  SessionRecord,
  UserRecord,
  UsersRepository,
} from './users.repository';

/** In-memory stand-in for PgUsersRepository, so access rules are unit-tested without a database. */
export class InMemoryUsersRepository implements UsersRepository {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly attempts: { email: string; at: Date }[] = [];
  readonly travelers = new Map<string, SavedTravelerRecord>();

  findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = [...this.users.values()].find((candidate) => candidate.email === email);
    return Promise.resolve(user ? { ...user } : null);
  }

  findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return Promise.resolve(user ? { ...user } : null);
  }

  insertUser(user: NewUserRecord): Promise<string> {
    const id = randomUUID();
    this.users.set(id, { ...user, id });
    return Promise.resolve(id);
  }

  updateUser(user: UserRecord): Promise<void> {
    this.users.set(user.id, { ...user });
    return Promise.resolve();
  }

  countFailedAttempts(email: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.attempts.filter((attempt) => attempt.email === email && attempt.at > since).length,
    );
  }

  recordFailedAttempt(email: string, at: Date): Promise<void> {
    this.attempts.push({ email, at });
    return Promise.resolve();
  }

  insertSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
    return Promise.resolve();
  }

  findSession(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    return Promise.resolve(session ? { ...session } : null);
  }

  updateSession(session: SessionRecord): Promise<void> {
    if (this.sessions.has(session.tokenHash)) this.sessions.set(session.tokenHash, { ...session });
    return Promise.resolve();
  }

  deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  deleteSessionsOfUser(userId: string): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(hash);
    }
    return Promise.resolve();
  }

  listSavedTravelers(ownerId: string): Promise<SavedTravelerRecord[]> {
    return Promise.resolve(
      [...this.travelers.values()]
        .filter((traveler) => traveler.ownerId === ownerId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  countSavedTravelers(ownerId: string): Promise<number> {
    return Promise.resolve(
      [...this.travelers.values()].filter((traveler) => traveler.ownerId === ownerId).length,
    );
  }

  insertSavedTraveler(traveler: Omit<SavedTravelerRecord, 'id'>): Promise<SavedTravelerRecord> {
    const saved = { ...traveler, id: randomUUID() };
    this.travelers.set(saved.id, saved);
    return Promise.resolve({ ...saved });
  }

  updateSavedTraveler(traveler: SavedTravelerRecord): Promise<SavedTravelerRecord | null> {
    const existing = this.travelers.get(traveler.id);
    if (!existing || existing.ownerId !== traveler.ownerId) return Promise.resolve(null);
    this.travelers.set(traveler.id, { ...traveler });
    return Promise.resolve({ ...traveler });
  }

  deleteSavedTraveler(ownerId: string, id: string): Promise<boolean> {
    const existing = this.travelers.get(id);
    if (!existing || existing.ownerId !== ownerId) return Promise.resolve(false);
    this.travelers.delete(id);
    return Promise.resolve(true);
  }
}

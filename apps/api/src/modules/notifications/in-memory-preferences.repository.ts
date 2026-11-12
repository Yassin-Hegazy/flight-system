import type { EmailPreference, PreferencesRepository } from './preferences.repository';

/** In-memory stand-in for PgPreferencesRepository, for unit tests. */
export class InMemoryPreferencesRepository implements PreferencesRepository {
  private readonly rows = new Map<string, boolean>();

  private key = (userId: string, type: string) => `${userId}|${type}`;

  list(userId: string): Promise<EmailPreference[]> {
    const prefix = `${userId}|`;
    return Promise.resolve(
      [...this.rows.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, email]) => ({ type: key.slice(prefix.length), email })),
    );
  }

  isEmailEnabled(userId: string, type: string): Promise<boolean> {
    return Promise.resolve(this.rows.get(this.key(userId, type)) === true);
  }

  setEmail(userId: string, type: string, enabled: boolean): Promise<void> {
    this.rows.set(this.key(userId, type), enabled);
    return Promise.resolve();
  }
}

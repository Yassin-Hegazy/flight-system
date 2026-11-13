export interface EmailPreference {
  type: string;
  email: boolean;
}

/**
 * Per-user, per-type notification choices. In-app is always on; email is opt-in, so the absence
 * of a row means "off" (US-NT-07 AC-1).
 */
export interface PreferencesRepository {
  /** The user's saved choices; a type with no row is off. */
  list(userId: string): Promise<EmailPreference[]>;
  isEmailEnabled(userId: string, type: string): Promise<boolean>;
  setEmail(userId: string, type: string, enabled: boolean): Promise<void>;
}

export const PREFERENCES_REPOSITORY = Symbol('PREFERENCES_REPOSITORY');

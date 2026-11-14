/**
 * Where to find a traveler's email address (a port). Notifications stores no addresses and cannot
 * ask Users and Access directly, so the module that owns them provides this.
 */
export interface EmailDirectory {
  /** The address for a user, or null when there is none. */
  emailOf(userId: string): Promise<string | null>;
}

/** Injection token, provided by UsersEmailDirectoryAdapter over Users and Access. */
export const EMAIL_DIRECTORY = Symbol('EMAIL_DIRECTORY');

/**
 * Where to find a traveler's email address (a port). Notifications stores no addresses and cannot
 * ask Users and Access directly, so the module that owns them provides this.
 */
export interface EmailDirectory {
  /** The address for a user, or null when there is none. */
  emailOf(userId: string): Promise<string | null>;
}

/** Injection token. Users and Access replaces the default provider in notifications.module.ts. */
export const EMAIL_DIRECTORY = Symbol('EMAIL_DIRECTORY');

/** The default until a real directory is provided: no address is known, so no email is sent. */
export class NoEmailDirectory implements EmailDirectory {
  emailOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

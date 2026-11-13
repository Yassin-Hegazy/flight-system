import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../shared/result';
import { NOTIFICATION_TYPES } from './notification-templates';
import type { NotificationPreference, PreferencesApi } from './notifications-api';
import { PREFERENCES_REPOSITORY, type PreferencesRepository } from './preferences.repository';

/**
 * The email preference use cases (US-NT-07). Every query is scoped to the user's own ID. In-app is
 * always on; email is opt-in per notification type, so a type with no saved choice is off.
 */
@Injectable()
export class NotificationPreferencesService implements PreferencesApi {
  constructor(
    @Inject(PREFERENCES_REPOSITORY) private readonly preferenceStore: PreferencesRepository,
  ) {}

  async preferences(userId: string): Promise<NotificationPreference[]> {
    const saved = new Map((await this.preferenceStore.list(userId)).map((p) => [p.type, p.email]));
    return NOTIFICATION_TYPES.map((type) => ({ type, email: saved.get(type) ?? false }));
  }

  async setEmailPreference(
    userId: string,
    type: string,
    enabled: boolean,
  ): Promise<Result<void, 'UNKNOWN_TYPE'>> {
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) return err('UNKNOWN_TYPE');
    await this.preferenceStore.setEmail(userId, type, enabled);
    return ok(undefined);
  }
}

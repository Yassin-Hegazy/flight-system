import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { NotificationPrefEntity } from './notification-pref.entity';
import type { EmailPreference, PreferencesRepository } from './preferences.repository';

/** PostgreSQL implementation of PreferencesRepository. */
@Injectable()
export class PgPreferencesRepository implements PreferencesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get db(): EntityManager {
    return this.dataSource.manager;
  }

  async list(userId: string): Promise<EmailPreference[]> {
    const rows = await this.db.find(NotificationPrefEntity, { where: { userId } });
    return rows.map(({ type, email }) => ({ type, email }));
  }

  async isEmailEnabled(userId: string, type: string): Promise<boolean> {
    return this.db.existsBy(NotificationPrefEntity, { userId, type, email: true });
  }

  async setEmail(userId: string, type: string, enabled: boolean): Promise<void> {
    // One statement, so two quick changes cannot collide on the (userId, type) key.
    await this.db.upsert(NotificationPrefEntity, { userId, type, email: enabled }, [
      'userId',
      'type',
    ]);
  }
}

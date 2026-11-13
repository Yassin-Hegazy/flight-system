import { Column, Entity, PrimaryColumn } from 'typeorm';

/** One user's email choice for one notification type. `userId` is a plain column, not a relation. */
@Entity('notification_prefs')
export class NotificationPrefEntity {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_notification_prefs' })
  userId!: string;

  @PrimaryColumn({ length: 40, primaryKeyConstraintName: 'PK_notification_prefs' })
  type!: string;

  @Column({ default: false })
  email!: boolean;
}

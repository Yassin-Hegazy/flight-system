import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One in-app notification for one user. `userId` and `eventId` are plain columns: a reference to
 * another module's data is never a TypeORM relation.
 */
@Entity('notifications')
// One notification per event and recipient: delivering an event twice stores it once (US-NT-01 AC-3).
@Unique('UQ_notifications_event_user', ['eventId', 'userId'])
// The inbox query: one user's notifications, newest first.
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_notifications' })
  id!: string;

  @Column('uuid')
  userId!: string;

  /** The ID of the domain event that caused this notification. */
  @Column({ length: 100 })
  eventId!: string;

  /** The domain event type, e.g. BookingConfirmed. */
  @Column({ length: 40 })
  type!: string;

  @Column({ length: 200 })
  title!: string;

  @Column('text')
  body!: string;

  /** An app-relative path the notification points to, or null. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  link!: string | null;

  /** Null while unread. */
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;
}

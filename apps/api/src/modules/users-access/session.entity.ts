import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity';

/** A server-side session, so sign-out and password changes can revoke it (S1 section 3.3). */
@Entity('sessions')
export class SessionEntity {
  /** SHA-256 of the random token; the token itself is only ever in the user's cookie. */
  @PrimaryColumn({ length: 64 })
  tokenHash!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;
}

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A failed sign-in, input to the 5-in-15-minutes lockout (US-USR-05 AC-3). */
@Entity('login_attempts')
@Index(['email', 'attemptedAt'])
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Not a foreign key: attempts are recorded for unknown emails too, so a lockout reveals nothing.
  @Column({ length: 320 })
  email!: string;

  @Column({ type: 'timestamptz' })
  attemptedAt!: Date;
}

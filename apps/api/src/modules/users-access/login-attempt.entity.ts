import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('login_attempts')
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 320 })
  @Index()
  email!: string;

  @Column({ type: 'timestamptz' })
  attemptedAt!: Date;
}

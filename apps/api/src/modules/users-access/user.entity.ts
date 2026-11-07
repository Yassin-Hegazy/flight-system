import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from './users-access.domain';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stored lower-case, so the unique constraint compares case-insensitively (US-USR-04 AC-1). */
  @Column({ length: 320, unique: true })
  email!: string;

  /** argon2id hash; the password itself is never stored (NFR-SEC-01). */
  @Column({ length: 255 })
  passwordHash!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Traveler })
  role!: UserRole;
}

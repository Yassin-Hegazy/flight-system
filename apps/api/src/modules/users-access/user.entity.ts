import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from './users-access.domain';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 320, unique: true })
  @Index()
  email!: string;

  @Column({ length: 255 })
  passwordHash!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Traveler })
  role!: UserRole;
}

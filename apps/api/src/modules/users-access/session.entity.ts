import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64, unique: true })
  @Index()
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
}

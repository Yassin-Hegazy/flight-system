import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_log')
export class AuditEntry {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') actorId!: string;
  @Column({ length: 60 }) action!: string;
  @Column('text') target!: string;
  @Column({ type: 'uuid', nullable: true }) flightId!: string | null;
  @Column({ type: 'jsonb', nullable: true }) before!: unknown;
  @Column({ type: 'jsonb', nullable: true }) after!: unknown;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt!: Date;
}

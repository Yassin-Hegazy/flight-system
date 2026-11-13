import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refunds')
export class RefundEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', unique: true }) paymentId!: string;
  @Column('integer') amountMinor!: number;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 16 }) reason!: 'CANCELLATION' | 'NOT_CONFIRMED';
  @Column({ type: 'varchar', length: 9, default: 'PENDING' }) status!: 'PENDING' | 'SUCCEEDED';
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ type: 'timestamptz', default: () => 'now()' }) retryAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) gatewayRef!: string | null;
}

import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('payments')
@Unique('payments_payer_key_unique', ['payerId', 'idempotencyKey'])
@Index('one_live_payment_per_booking', ['bookingId'], {
  unique: true,
  where: `"status" IN ('PENDING', 'SUCCEEDED')`,
})
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') bookingId!: string;
  @Column('uuid') payerId!: string;
  @Column({ type: 'varchar', length: 100 }) idempotencyKey!: string;
  @Column({ type: 'varchar', length: 64 }) requestHash!: string;
  @Column('integer') amountMinor!: number;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 9, default: 'PENDING' })
  status!: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  @Column({ type: 'varchar', length: 100, nullable: true }) gatewayRef!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) cardBrand!: string | null;
  @Column({ type: 'varchar', length: 4, nullable: true }) cardLast4!: string | null;
  @Column({ type: 'varchar', length: 12, nullable: true })
  failureCode!: 'DECLINED' | 'HOLD_EXPIRED' | null;
}

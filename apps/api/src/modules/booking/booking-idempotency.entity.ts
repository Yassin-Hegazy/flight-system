import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Remembers which booking an Idempotency-Key produced, for 24 hours (NFR-REL-01). */
@Entity('booking_idempotency')
export class BookingIdempotencyEntity {
  @PrimaryColumn('uuid') ownerId!: string;
  @PrimaryColumn({ type: 'varchar', length: 100 }) key!: string;
  @Column({ type: 'varchar', length: 64 }) requestHash!: string;
  @Column('uuid') bookingId!: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt!: Date;
}

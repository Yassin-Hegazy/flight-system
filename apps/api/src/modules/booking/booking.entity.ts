import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { Cabin } from '../flight-catalog/index';

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'TICKETED' | 'CANCELLED';

@Entity('bookings')
@Index('bookings_by_flight', ['flightId'])
export class BookingEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 6, unique: true }) reference!: string;
  @Column('uuid') ownerId!: string;
  @Column({ length: 120 }) passengerName!: string;
  @Column('uuid') flightId!: string;
  @Column({ type: 'varchar', length: 8 }) cabin!: Cabin;
  @Column({ type: 'uuid', unique: true }) holdId!: string;
  @Column('integer') amountMinor!: number;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 15 }) status!: BookingStatus;
  @Column({ type: 'uuid', nullable: true }) paymentId!: string | null;
}

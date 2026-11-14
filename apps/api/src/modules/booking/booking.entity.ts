import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { Cabin } from '../flight-catalog/index';
import type { BookingStatus } from './booking-state';

export type { BookingStatus } from './booking-state';

/** The single record of a reservation. The fare columns are the snapshot taken at creation. */
@Entity('bookings')
@Index('bookings_by_flight', ['flightId'])
export class BookingEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 6, unique: true }) reference!: string;
  @Column('uuid') ownerId!: string;
  /** The lead passenger's full name; the full list is in booking_passengers. */
  @Column({ length: 120 }) passengerName!: string;
  @Column('uuid') flightId!: string;
  @Column({ type: 'varchar', length: 8 }) cabin!: Cabin;
  @Column({ type: 'uuid', unique: true }) holdId!: string;
  /** Total for all passengers, in integer minor units (NFR-DATA-01). */
  @Column('integer') amountMinor!: number;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 15 }) status!: BookingStatus;
  @Column({ type: 'uuid', nullable: true }) paymentId!: string | null;
  /** When the seat hold lapses; the traveler sees it while the booking is pending payment. */
  @Column({ type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) cancelReason!:
    'TRAVELER' | 'AIRLINE' | null;
}

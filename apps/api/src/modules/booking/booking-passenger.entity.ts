import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { PassengerKind } from './passenger-rules';

/**
 * A passenger copied into a booking. Never a reference to a profile or saved traveler, so later
 * edits there cannot change a booking (US-BK-09 AC-2).
 */
@Entity('booking_passengers')
@Index('booking_passengers_by_booking', ['bookingId'])
export class BookingPassengerEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') bookingId!: string;
  @Column('integer') position!: number;
  @Column({ type: 'varchar', length: 120 }) firstName!: string;
  @Column({ type: 'varchar', length: 120, default: '' }) lastName!: string;
  /** Null only for bookings made before passenger details were collected. */
  @Column({ type: 'date', nullable: true }) birthDate!: string | null;
  @Column({ type: 'varchar', length: 6 }) type!: PassengerKind;
  /** This passenger's fare at booking time, in integer minor units. */
  @Column('integer') fareMinor!: number;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
}

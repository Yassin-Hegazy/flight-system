import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BookingStatus } from './booking-state';

export type TransitionCause =
  'CREATED' | 'PAYMENT' | 'TICKETING' | 'TRAVELER' | 'AIRLINE' | 'EXPIRY';

/** Every status transition with its time and cause (US-BK-02 AC-2). */
@Entity('booking_history')
@Index('booking_history_by_booking', ['bookingId'])
export class BookingHistoryEntity {
  @PrimaryGeneratedColumn('increment') id!: number;
  @Column('uuid') bookingId!: string;
  @Column({ type: 'varchar', length: 15, nullable: true }) fromStatus!: BookingStatus | null;
  @Column({ type: 'varchar', length: 15 }) toStatus!: BookingStatus;
  @Column({ type: 'varchar', length: 10 }) cause!: TransitionCause;
  @Column({ type: 'timestamptz', default: () => 'now()' }) at!: Date;
}

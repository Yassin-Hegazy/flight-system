import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { Cabin } from '../flight-catalog/index';

/** One leg of a booking: one in Beta, two for round trips later (designing for it now). */
@Entity('booking_segments')
@Index('booking_segments_by_booking', ['bookingId'])
export class BookingSegmentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') bookingId!: string;
  @Column('integer') position!: number;
  @Column('uuid') flightId!: string;
  @Column({ type: 'varchar', length: 8 }) cabin!: Cabin;
  @Column({ type: 'uuid', unique: true }) holdId!: string;
}

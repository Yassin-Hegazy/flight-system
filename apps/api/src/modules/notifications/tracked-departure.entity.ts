import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One leg of a ticketed booking, kept from the events Notifications observes so the reminder job
 * never has to ask Booking or the Catalog (the pack: "Calls into: nothing"). IDs are plain columns.
 */
@Entity('tracked_departures')
// The reminder job's query: departures in a one-hour window.
@Index('IDX_tracked_departures_departure', ['departureUtc'])
export class TrackedDepartureEntity {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_tracked_departures' })
  bookingId!: string;

  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_tracked_departures' })
  flightId!: string;

  @Column('uuid')
  ownerId!: string;

  @Column({ length: 6 })
  ref!: string;

  @Column({ length: 6 })
  flightNumber!: string;

  /** The expected departure: the scheduled one, or the new one after a delay. */
  @Column('timestamptz')
  departureUtc!: Date;

  @Column({ length: 64 })
  departureTimeZone!: string;

  @Column({ length: 16, default: 'SCHEDULED' })
  flightStatus!: string;
}

import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { FlightStatus } from './flight-status';

@Entity('flights')
@Index('flights_route_departure', ['originCode', 'destinationCode', 'scheduledDepartureUtc'])
// A flight number repeats daily; it is unique only per departure date at the origin.
@Unique('flights_number_per_day', ['flightNumber', 'departureLocalDate'])
export class FlightEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 6 })
  flightNumber!: string;

  @Column({ length: 2 })
  airlineCode!: string;

  @Column({ length: 3 })
  originCode!: string;

  @Column({ length: 3 })
  destinationCode!: string;

  @Column({ type: 'timestamptz' })
  scheduledDepartureUtc!: Date;

  @Column({ type: 'timestamptz' })
  scheduledArrivalUtc!: Date;

  @Column({ type: 'date' })
  departureLocalDate!: string;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedDepartureUtc!: Date | null;

  @Column({ type: 'enum', enum: FlightStatus, default: FlightStatus.Scheduled })
  status!: FlightStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cancelReason!: string | null;
}

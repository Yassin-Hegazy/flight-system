import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AirlineEntity } from './airline.entity';
import { AirportEntity } from './airport.entity';
import { FlightStatus } from './flight-status';

@Entity('flights')
@Index('flights_route_departure', ['originCode', 'destinationCode', 'scheduledDepartureUtc'])
// A flight number repeats daily; it is unique only per departure date at the origin.
@Unique('flights_number_per_day', ['flightNumber', 'departureLocalDate'])
// The domain enforces these too; the database keeps them true whatever writes the row.
@Check('flights_different_airports', '"originCode" <> "destinationCode"')
@Check('flights_arrival_after_departure', '"scheduledArrivalUtc" > "scheduledDepartureUtc"')
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

  // Relations inside this module only, so the database rejects a flight that points at a missing
  // airline or airport (module rule 3 forbids relations to other modules' entities).
  @ManyToOne(() => AirlineEntity, { nullable: false })
  @JoinColumn({ name: 'airlineCode' })
  airline?: AirlineEntity;

  @ManyToOne(() => AirportEntity, { nullable: false })
  @JoinColumn({ name: 'originCode' })
  origin?: AirportEntity;

  @ManyToOne(() => AirportEntity, { nullable: false })
  @JoinColumn({ name: 'destinationCode' })
  destination?: AirportEntity;
}

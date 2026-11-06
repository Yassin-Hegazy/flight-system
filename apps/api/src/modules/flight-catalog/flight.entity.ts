import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { FlightStatus } from './flight-catalog.domain';

@Entity('flights')
@Index('flights_route_departure', ['originCode', 'destinationCode', 'scheduledDepartureUtc'])
export class FlightEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 10, unique: true })
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

  @Column({ type: 'timestamptz', nullable: true })
  estimatedDepartureUtc!: Date | null;

  @Column({ type: 'enum', enum: FlightStatus, default: FlightStatus.Scheduled })
  status!: FlightStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cancelReason!: string | null;
}

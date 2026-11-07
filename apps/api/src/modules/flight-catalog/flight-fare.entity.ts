import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('flight_fares')
@Index(['flightId', 'cabin'], { unique: true })
export class FlightFareEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  flightId!: string;

  @Column({ length: 20 })
  cabin!: string;

  /** Whole minor units (piastres, cents), never a fraction (NFR-DATA-01). */
  @Column({ type: 'integer' })
  amountMinor!: number;

  @Column({ length: 3 })
  currency!: string;
}

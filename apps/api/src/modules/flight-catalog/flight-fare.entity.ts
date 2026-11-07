import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { FlightEntity } from './flight.entity';
import { CABINS, type Cabin } from './value-objects';

/** The adult fare of one cabin on one flight. A flight has at most one fare per cabin. */
@Entity('flight_fares')
@Check('flight_fares_amount_positive', '"amountMinor" > 0')
export class FlightFareEntity {
  @PrimaryColumn('uuid')
  flightId!: string;

  @PrimaryColumn({ type: 'enum', enum: CABINS })
  cabin!: Cabin;

  /** Whole minor units (piastres, cents), never a fraction (NFR-DATA-01). */
  @Column({ type: 'integer' })
  amountMinor!: number;

  @Column({ length: 3 })
  currency!: string;

  @ManyToOne(() => FlightEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flightId' })
  flight?: FlightEntity;
}

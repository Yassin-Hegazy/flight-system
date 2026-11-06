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

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: number;

  @Column({ length: 3 })
  currency!: string;
}

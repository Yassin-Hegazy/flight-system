import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CABINS, type Cabin } from '../flight-catalog/index';
import { CabinInventoryEntity } from './cabin-inventory.entity';

export const HOLD_STATUSES = ['HELD', 'COMMITTED', 'RELEASED', 'EXPIRED'] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

@Entity('seat_holds')
@Check('seat_holds_seats_positive', '"seats" > 0')
@Index('seat_holds_booking', ['bookingId'])
@Index('seat_holds_active_cabin_expiry', ['flightId', 'cabin', 'expiresAt'], {
  where: '"status" = \'HELD\'',
})
@Index('seat_holds_active_expiry', ['expiresAt'], { where: '"status" = \'HELD\'' })
export class SeatHoldEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'seat_holds_pkey' })
  id!: string;

  /** Plain Booking identifier, allowing a booking to cover more than one flight. */
  @Column('uuid')
  bookingId!: string;

  @Column('uuid')
  flightId!: string;

  @Column({ type: 'enum', enum: CABINS, enumName: 'inventory_cabin_enum' })
  cabin!: Cabin;

  @Column({ type: 'integer' })
  seats!: number;

  @Column({ type: 'enum', enum: HOLD_STATUSES, enumName: 'seat_hold_status_enum', default: 'HELD' })
  status!: HoldStatus;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  // This relationship stays entirely inside Inventory.
  @ManyToOne(() => CabinInventoryEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn([
    {
      name: 'flightId',
      referencedColumnName: 'flightId',
      foreignKeyConstraintName: 'seat_holds_inventory_fk',
    },
    {
      name: 'cabin',
      referencedColumnName: 'cabin',
      foreignKeyConstraintName: 'seat_holds_inventory_fk',
    },
  ])
  inventory?: CabinInventoryEntity;
}

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { CABINS, type Cabin } from '../flight-catalog/index';

@Entity('cabin_inventory')
@Check('cabin_inventory_capacity_nonnegative', '"capacity" >= 0')
@Check(
  'cabin_inventory_committed_valid',
  '"committedSeats" >= 0 AND "committedSeats" <= "capacity"',
)
export class CabinInventoryEntity {
  /** Plain Catalog identifier; Inventory has no relation to Catalog entities. */
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'cabin_inventory_pkey' })
  flightId!: string;

  @PrimaryColumn({
    type: 'enum',
    enum: CABINS,
    enumName: 'inventory_cabin_enum',
    primaryKeyConstraintName: 'cabin_inventory_pkey',
  })
  cabin!: Cabin;

  @Column({ type: 'integer' })
  capacity!: number;

  @Column({ type: 'integer', default: 0 })
  committedSeats!: number;
}

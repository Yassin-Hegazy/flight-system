import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Airports are a few hundred rows of reference data, so search by name and city scans the table;
 * a B-tree index could not serve LIKE '%x%' anyway.
 */
@Entity('airports')
export class AirportEntity {
  @PrimaryColumn({ length: 3 })
  code!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ length: 120 })
  city!: string;

  @Column({ length: 120 })
  country!: string;

  /** IANA time zone, e.g. Africa/Cairo. */
  @Column({ length: 64 })
  timezone!: string;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('airports')
export class AirportEntity {
  @PrimaryColumn({ length: 3 })
  code!: string;

  @Column({ length: 120 })
  @Index()
  name!: string;

  @Column({ length: 120 })
  @Index()
  city!: string;

  @Column({ length: 120 })
  country!: string;

  @Column({ length: 64 })
  timezone!: string;
}

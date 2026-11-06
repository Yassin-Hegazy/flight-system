import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('airlines')
export class AirlineEntity {
  @PrimaryColumn({ length: 2 })
  code!: string;

  @Column({ length: 120 })
  name!: string;
}

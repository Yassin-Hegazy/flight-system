import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('saved_travelers')
export class SavedTravelerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  ownerId!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'date' })
  dateOfBirth!: string;
}

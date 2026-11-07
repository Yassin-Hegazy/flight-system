import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from './user.entity';

/** Someone a traveler often books for (US-USR-06); copied into bookings, never linked. */
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

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner?: UserEntity;
}

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tickets')
@Index('tickets_by_flight', ['flightId'])
export class TicketEntity {
  @PrimaryGeneratedColumn('uuid') number!: string;
  @Column({ type: 'uuid', unique: true }) bookingId!: string;
  @Column('uuid') flightId!: string;
  @Column({ type: 'varchar', length: 6 }) status!: 'ISSUED' | 'VOID';
}

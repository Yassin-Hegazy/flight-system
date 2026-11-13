import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import type { Cabin } from '../flight-catalog/index';
import type { TicketStatus } from './ticket';

@Entity('tickets')
@Index('tickets_by_flight', ['flightId'])
@Unique('tickets_one_per_passenger_segment', ['bookingId', 'passengerId', 'segmentId'])
export class TicketEntity {
  @PrimaryColumn({ type: 'char', length: 13 }) number!: string;
  @Column('uuid') bookingId!: string;
  @Column({ type: 'varchar', length: 64 }) passengerId!: string;
  @Column({ type: 'varchar', length: 120 }) passengerName!: string;
  @Column({ type: 'varchar', length: 64 }) segmentId!: string;
  @Column('uuid') flightId!: string;
  @Column({ type: 'varchar', length: 8 }) cabin!: Cabin;
  @Column('integer') fareMinor!: number;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 5 }) status!: TicketStatus;
  @Column('timestamptz') issuedAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) voidedAt!: Date | null;
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightTickets } from './flight-tickets';
import { TicketEntity } from './ticket.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TicketEntity])],
  providers: [FlightTickets],
  exports: [FlightTickets],
})
export class TicketingModule {}

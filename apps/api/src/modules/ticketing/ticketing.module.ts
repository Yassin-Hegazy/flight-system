import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { BookingModule } from '../booking/index';
import { FlightCatalogModule } from '../flight-catalog/index';
import { IssueTickets } from './issue-tickets';
import { ETicketCreator, TICKET_NUMBERS, TicketCreator } from './ticket-creator';
import { TicketEntity } from './ticket.entity';
import { SequenceTicketNumbers } from './ticket-numbers';
import { TicketRepairJob } from './ticket-repair.job';
import { FlightTickets, TicketViews } from './ticket-views';
import { TicketingController } from './ticketing.controller';
import { TicketsRepository } from './tickets.repository';
import { VoidTickets } from './void-tickets';

@Module({
  imports: [BookingModule, FlightCatalogModule, TypeOrmModule.forFeature([TicketEntity])],
  controllers: [TicketingController],
  providers: [
    TicketsRepository,
    { provide: TICKET_NUMBERS, useClass: SequenceTicketNumbers },
    { provide: CLOCK, useValue: systemClock },
    // Callers depend on the abstract Creator; this line picks the ConcreteCreator.
    { provide: TicketCreator, useClass: ETicketCreator },
    IssueTickets,
    VoidTickets,
    TicketRepairJob,
    TicketViews,
    FlightTickets,
  ],
  exports: [FlightTickets],
})
export class TicketingModule {}

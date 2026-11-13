import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { BOOKING_TICKETING, type BookingTicketing } from '../booking/index';
import { CATALOG_API, type CatalogApi, type FlightInfo } from '../flight-catalog/index';
import { TICKET_NUMBER, type Ticket } from './ticket';
import { TicketsRepository } from './tickets.repository';

const place = ({ code, name, city }: FlightInfo['origin']) => ({ code, name, city });

/** US-TK-02: what a traveler sees for one ticket, with the flight as it stands now. */
export function ticketView(ticket: Ticket, bookingReference: string, flight: FlightInfo) {
  return {
    ticketNumber: ticket.number,
    status: ticket.status,
    bookingReference,
    passengerName: ticket.passengerName,
    cabin: ticket.cabin,
    flight: {
      flightNumber: flight.flightNumber,
      airline: flight.airline,
      origin: place(flight.origin),
      destination: place(flight.destination),
      scheduledDepartureLocal: flight.scheduledDepartureLocal,
      scheduledArrivalLocal: flight.scheduledArrivalLocal,
      ...(flight.estimatedDepartureLocal && {
        estimatedDepartureLocal: flight.estimatedDepartureLocal,
      }),
      status: flight.status,
    },
    issuedAt: ticket.issuedAt,
    voidedAt: ticket.voidedAt,
  };
}

export type TicketView = ReturnType<typeof ticketView>;

/** US-TK-04: one passenger's e-ticket as printed; a void ticket carries a VOID marking. */
export function printableTicket(view: TicketView) {
  return {
    ticketNumber: view.ticketNumber,
    status: view.status,
    voidMarking: view.status === 'VOID' ? ('VOID' as const) : null,
    passengerName: view.passengerName,
    bookingReference: view.bookingReference,
    airline: view.flight.airline.name,
    flightNumber: view.flight.flightNumber,
    from: view.flight.origin.code,
    to: view.flight.destination.code,
    departureLocal: view.flight.scheduledDepartureLocal,
    arrivalLocal: view.flight.scheduledArrivalLocal,
    ...(view.flight.estimatedDepartureLocal && {
      estimatedDepartureLocal: view.flight.estimatedDepartureLocal,
    }),
    cabin: view.cabin,
  };
}

/** Reads for travelers. A ticket that is not the viewer's is reported exactly like a missing one. */
@Injectable()
export class TicketViews {
  constructor(
    private readonly tickets: TicketsRepository,
    @Inject(BOOKING_TICKETING) private readonly booking: BookingTicketing,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
  ) {}

  async forBooking(reference: string, viewerId: string): Promise<TicketView[] | null> {
    const bookingId = await this.booking.ownedId(reference, viewerId);
    if (!bookingId) return null;
    const tickets = await this.tickets.findByBooking(bookingId);
    const flights = new Map<string, Promise<FlightInfo>>();
    return Promise.all(
      tickets.map(async (ticket) => {
        if (!flights.has(ticket.flightId)) flights.set(ticket.flightId, this.flight(ticket));
        return ticketView(ticket, reference, await flights.get(ticket.flightId)!);
      }),
    );
  }

  async one(number: string, viewerId: string): Promise<TicketView | null> {
    if (!TICKET_NUMBER.test(number)) return null;
    const ticket = await this.tickets.findByNumber(number);
    if (!ticket) return null;
    const booking = await this.booking.getForTicketing(ticket.bookingId);
    if (!booking || booking.ownerId !== viewerId) return null;
    return ticketView(ticket, booking.reference, await this.flight(ticket));
  }

  private async flight(ticket: Ticket): Promise<FlightInfo> {
    const flight = await this.catalog.getFlight(ticket.flightId);
    if (!flight) throw new Error(`Ticket ${ticket.number} names a flight the Catalog lacks`);
    return flight;
  }
}

/** The manifest's view of a flight's tickets (US-AD-05), read in the caller's transaction. */
@Injectable()
export class FlightTickets {
  constructor(private readonly tickets: TicketsRepository) {}

  async forFlight(tx: Tx, flightId: string) {
    const tickets = await this.tickets.forFlight(tx, flightId);
    return tickets.map(({ number, bookingId, status }) => ({ number, bookingId, status }));
  }
}

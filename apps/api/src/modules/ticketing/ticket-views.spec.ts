import { describe, expect, it } from 'vitest';
import { money } from '../../shared/money';
import type { CatalogApi, FlightInfo } from '../flight-catalog/index';
import { FlightStatus } from '../flight-catalog/index';
import { IssueTickets } from './issue-tickets';
import type { Ticket } from './ticket';
import { TicketRepairJob } from './ticket-repair.job';
import { printableTicket, ticketView, TicketViews } from './ticket-views';
import type { TicketsRepository } from './tickets.repository';
import {
  booking,
  BOOKING_ID,
  FakeBooking,
  InMemoryTickets,
  ISSUED_AT,
  OUTBOUND,
  OWNER,
} from './test-support';

const TICKET: Ticket = {
  number: '9990000000001',
  bookingId: BOOKING_ID,
  passengerId: 'p-1',
  passengerName: 'Mona Adel',
  segmentId: 's-1',
  flightId: OUTBOUND,
  cabin: 'ECONOMY',
  fare: money(1_500_000, 'EGP'),
  status: 'VALID',
  issuedAt: ISSUED_AT,
  voidedAt: null,
};

const airport = (code: string, city: string, timezone: string) => ({
  code,
  name: `${city} Airport`,
  city,
  timezone,
});

const FLIGHT: FlightInfo = {
  id: OUTBOUND,
  flightNumber: 'MS777',
  airline: { code: 'MS', name: 'EgyptAir' },
  origin: airport('CAI', 'Cairo', 'Africa/Cairo'),
  destination: airport('LHR', 'London', 'Europe/London'),
  scheduledDepartureUtc: new Date('2027-03-01T06:00:00Z'),
  scheduledArrivalUtc: new Date('2027-03-01T11:00:00Z'),
  scheduledDepartureLocal: '2027-03-01T08:00+02:00',
  scheduledArrivalLocal: '2027-03-01T11:00+00:00',
  durationMinutes: 300,
  status: FlightStatus.Scheduled,
  fares: {},
};

describe('US-TK-02 ticket view', () => {
  it('US-TK-02-T01 shows number, passenger, flight, route, local times, cabin, reference and status', () => {
    expect(ticketView(TICKET, 'K7M2QP', FLIGHT)).toEqual({
      ticketNumber: '9990000000001',
      status: 'VALID',
      bookingReference: 'K7M2QP',
      passengerName: 'Mona Adel',
      cabin: 'ECONOMY',
      flight: {
        flightNumber: 'MS777',
        airline: { code: 'MS', name: 'EgyptAir' },
        origin: { code: 'CAI', name: 'Cairo Airport', city: 'Cairo' },
        destination: { code: 'LHR', name: 'London Airport', city: 'London' },
        scheduledDepartureLocal: '2027-03-01T08:00+02:00',
        scheduledArrivalLocal: '2027-03-01T11:00+00:00',
        status: FlightStatus.Scheduled,
      },
      issuedAt: ISSUED_AT,
      voidedAt: null,
    });
  });

  it("US-TK-02-T04 a delay shows the flight's status and new local departure beside the scheduled one", () => {
    const delayed = {
      ...FLIGHT,
      status: FlightStatus.Delayed,
      estimatedDepartureUtc: new Date('2027-03-01T07:30:00Z'),
      estimatedDepartureLocal: '2027-03-01T09:30+02:00',
    };

    expect(ticketView(TICKET, 'K7M2QP', delayed).flight).toMatchObject({
      status: FlightStatus.Delayed,
      scheduledDepartureLocal: '2027-03-01T08:00+02:00',
      estimatedDepartureLocal: '2027-03-01T09:30+02:00',
    });
  });

  it('US-TK-02-T02 a ticket that is not the viewer’s reads exactly like a missing one', async () => {
    const tickets = new InMemoryTickets();
    tickets.rows.push(TICKET);
    const views = new TicketViews(
      tickets as unknown as TicketsRepository,
      new FakeBooking(booking()),
      { getFlight: () => Promise.resolve(FLIGHT) } as unknown as CatalogApi,
    );

    await expect(views.one(TICKET.number, OWNER)).resolves.toMatchObject({
      ticketNumber: TICKET.number,
    });
    await expect(views.one(TICKET.number, 'someone-else')).resolves.toBeNull();
    await expect(views.one('9990000000999', OWNER)).resolves.toBeNull();
    await expect(views.one('not-a-number', OWNER)).resolves.toBeNull();
  });
});

describe('US-TK-04 printable ticket', () => {
  it('US-TK-04-T04 carries number, name, flight, local times and reference, unmarked while valid', () => {
    expect(printableTicket(ticketView(TICKET, 'K7M2QP', FLIGHT))).toEqual({
      ticketNumber: '9990000000001',
      status: 'VALID',
      voidMarking: null,
      passengerName: 'Mona Adel',
      bookingReference: 'K7M2QP',
      airline: 'EgyptAir',
      flightNumber: 'MS777',
      from: 'CAI',
      to: 'LHR',
      departureLocal: '2027-03-01T08:00+02:00',
      arrivalLocal: '2027-03-01T11:00+00:00',
      cabin: 'ECONOMY',
    });
  });

  it('US-TK-04-T05 a void ticket prints with a VOID marking', () => {
    const voided = { ...TICKET, status: 'VOID' as const, voidedAt: ISSUED_AT };

    expect(printableTicket(ticketView(voided, 'K7M2QP', FLIGHT))).toMatchObject({
      status: 'VOID',
      voidMarking: 'VOID',
    });
  });
});

describe('NFR-REL-02 TicketRepairJob', () => {
  it('NFR-REL-02-T06 asks Booking for bookings left CONFIRMED and issues each, carrying on past a failure', async () => {
    const issued: string[] = [];
    const bookings = new FakeBooking();
    bookings.awaitingTickets = () => Promise.resolve(['b-1', 'b-2', 'b-3']);
    const issue = {
      execute: (id: string) => {
        if (id === 'b-2') return Promise.reject(new Error('database blip'));
        issued.push(id);
        return Promise.resolve({ ok: true });
      },
    } as unknown as IssueTickets;

    await new TicketRepairJob(bookings, issue).run();

    expect(issued).toEqual(['b-1', 'b-3']);
  });
});

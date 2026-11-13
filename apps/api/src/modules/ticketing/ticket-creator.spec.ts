import { describe, expect, it } from 'vitest';
import { money } from '../../shared/money';
import { TICKET_NUMBER } from './ticket';
import { NotEligibleForTicketing } from './ticket-creator';
import {
  booking,
  BOOKING_ID,
  CountingNumbers,
  creator,
  family,
  ISSUED_AT,
  OUTBOUND,
  RETURN,
  roundTrip,
  TX,
} from './test-support';

describe('US-TK-01 ETicketCreator (Factory Method: Creator and ConcreteCreator)', () => {
  it.each(['PENDING_PAYMENT', 'TICKETED', 'CANCELLED'] as const)(
    'US-TK-01-T01 a %s booking is not eligible and gets no ticket number',
    async (status) => {
      const numbers = new CountingNumbers();

      await expect(creator(numbers).forBooking(TX, booking({ status }))).rejects.toBeInstanceOf(
        NotEligibleForTicketing,
      );
      expect(numbers.asked).toEqual([]);
    },
  );

  it.each([
    { party: 'one adult, one flight', passengers: undefined, segments: undefined, count: 1 },
    {
      party: '2 adults and an infant, one flight',
      passengers: family(),
      segments: undefined,
      count: 3,
    },
    {
      party: '2 adults and an infant, round trip',
      passengers: family(),
      segments: roundTrip(),
      count: 6,
    },
  ])(
    'US-TK-01-T02 $party: $count tickets, each numbered once',
    async ({ passengers, segments, count }) => {
      const tickets = await creator().forBooking(
        TX,
        booking({ ...(passengers && { passengers }), ...(segments && { segments }) }),
      );

      expect(tickets).toHaveLength(count);
      expect(new Set(tickets.map((ticket) => ticket.number)).size).toBe(count);
      for (const ticket of tickets) expect(ticket.number).toMatch(TICKET_NUMBER);
    },
  );

  it("US-TK-01-T06 each ticket's passenger, flight, cabin and fare match the booking", async () => {
    const tickets = await creator().forBooking(
      TX,
      booking({ passengers: family(), segments: roundTrip() }),
    );

    expect(
      tickets.map(({ passengerName, flightId, cabin, fare, segmentId }) => ({
        passengerName,
        segmentId,
        flightId,
        cabin,
        fare,
      })),
    ).toEqual(
      [
        ['s-1', OUTBOUND],
        ['s-2', RETURN],
      ].flatMap(([segmentId, flightId]) =>
        [
          ['Mona Adel', 1_500_000],
          ['Karim Adel', 1_500_000],
          ['Laila Adel', 150_000],
        ].map(([passengerName, amount]) => ({
          passengerName,
          segmentId,
          flightId,
          cabin: 'ECONOMY',
          fare: money(amount as number, 'EGP'),
        })),
      ),
    );
    expect(tickets[0]).toMatchObject({
      number: '9990000000001',
      bookingId: BOOKING_ID,
      passengerId: 'p-1',
      status: 'VALID',
      issuedAt: ISSUED_AT,
      voidedAt: null,
    });
  });

  it('US-TK-01-T10 numbers come from the generator inside the issuing transaction', async () => {
    const numbers = new CountingNumbers();

    await creator(numbers).forBooking(TX, booking({ passengers: family() }));

    expect(numbers.asked).toEqual([TX, TX, TX]);
  });
});

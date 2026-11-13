import { describe, expect, it } from 'vitest';
import { booking, BOOKING_ID, family, issueFixture, TX } from './test-support';

describe('US-TK-01 IssueTickets', () => {
  it('US-TK-01-T04 issuing twice returns the same tickets and creates none', async () => {
    const { issue, tickets } = issueFixture(booking({ passengers: family() }));

    const first = await issue.execute(BOOKING_ID);
    const second = await issue.execute(BOOKING_ID);

    expect(second).toEqual(first);
    expect(tickets.rows).toHaveLength(3);
  });

  it('US-TK-01-T07 marks the booking TICKETED with the tickets, then announces TicketsIssued', async () => {
    const { issue, bookings, tickets, log } = issueFixture();

    const result = await issue.execute(BOOKING_ID);

    expect(result).toMatchObject({ ok: true, value: [{ number: '9990000000001' }] });
    expect(bookings.marked).toEqual([{ tx: TX, bookingId: BOOKING_ID }]);
    expect(tickets.rows).toHaveLength(1);
    expect(log).toEqual(['begin', 'commit', `publish TicketsIssued tickets:${BOOKING_ID}`]);
  });

  it.each(['PENDING_PAYMENT', 'CANCELLED'] as const)(
    'US-TK-01-T01 a %s booking is refused and nothing is written',
    async (status) => {
      const { issue, bookings, tickets, log } = issueFixture(booking({ status }));

      await expect(issue.execute(BOOKING_ID)).resolves.toEqual({
        ok: false,
        error: 'NOT_ELIGIBLE',
      });
      expect(bookings.marked).toEqual([]);
      expect(tickets.rows).toEqual([]);
      expect(log).toEqual([]);
    },
  );

  it('US-TK-01-T08 a booking cancelled before issuance commits gets no tickets', async () => {
    const { issue, bookings, tickets, log } = issueFixture();
    bookings.markResult = false;

    await expect(issue.execute(BOOKING_ID)).resolves.toEqual({ ok: false, error: 'NOT_ELIGIBLE' });
    expect(tickets.rows).toEqual([]);
    expect(log).toEqual(['begin', 'rollback']);
  });

  it('US-TK-01-T09 an unknown booking is not found', async () => {
    const { issue } = issueFixture(null);

    await expect(issue.execute(BOOKING_ID)).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('US-TK-01-T11 a run that loses the race to another returns the tickets the winner issued', async () => {
    const { issue, bookings, tickets } = issueFixture();
    const winner = await issueFixture().issue.execute(BOOKING_ID);
    if (!winner.ok) throw new Error(winner.error);
    // The winner committed after this run checked for tickets but before it marked the booking.
    const findByBooking = tickets.findByBooking.bind(tickets);
    let checks = 0;
    tickets.findByBooking = (id) => (checks++ === 0 ? Promise.resolve([]) : findByBooking(id));
    tickets.rows.push(...winner.value);
    bookings.markResult = false;

    await expect(issue.execute(BOOKING_ID)).resolves.toEqual(winner);
  });
});

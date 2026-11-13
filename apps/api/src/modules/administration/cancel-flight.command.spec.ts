import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import type { BookingCancelled } from '../../shared/events';
import type { BookingOwners } from '../booking/index';
import { FlightStatus } from '../flight-catalog/index';
import { CancelFlight } from './cancel-flight.command';
import { asAdmin, FakeCatalog, fakeBus, FLIGHT_ID, TX } from './test-support';

const cancelled = (bookingId: string): BookingCancelled => ({
  type: 'BookingCancelled',
  reason: 'AIRLINE',
  eventId: `e-${bookingId}`,
  bookingId,
  ownerId: `owner-${bookingId}`,
  ref: 'K7M2QP',
});

function fixture() {
  const catalog = new FakeCatalog();
  const calls: string[] = [];
  const bookings = {
    cancelForFlight: (tx: Tx, flightId: string) => {
      calls.push(`cancel bookings of ${flightId}${tx === TX ? ' in tx' : ''}`);
      return Promise.resolve([cancelled('b-1'), cancelled('b-2')]);
    },
  };
  const owners = {
    activeOwnersOf: () => Promise.resolve(['owner-b-1', 'owner-b-2']),
  } as unknown as BookingOwners;
  const command = new CancelFlight(catalog.api, bookings, owners, FLIGHT_ID, 'Aircraft fault');
  return { catalog, calls, command };
}

describe('US-AD-04 Cancel a flight (command)', () => {
  it('US-AD-04-T05 cancels with its reason, cascades in the transaction, and announces after commit', async () => {
    const { catalog, calls, command } = fixture();
    const { bus, log, audits } = fakeBus();

    const result = await bus.dispatch(command, asAdmin());

    expect(result).toEqual({ ok: true, value: { status: FlightStatus.Cancelled } });
    expect(catalog.statusChanges).toMatchObject([
      { tx: TX, id: FLIGHT_ID, next: FlightStatus.Cancelled },
    ]);
    expect(calls).toEqual([`cancel bookings of ${FLIGHT_ID} in tx`]);
    expect(audits[0].changes).toEqual([
      {
        target: FLIGHT_ID,
        flightId: FLIGHT_ID,
        before: { status: FlightStatus.Scheduled, cancelReason: null },
        after: {
          status: FlightStatus.Cancelled,
          cancelReason: 'Aircraft fault',
          bookingsCancelled: 2,
        },
      },
    ]);
    expect(log).toEqual([
      'begin',
      'commit',
      'publish BookingCancelled',
      'publish BookingCancelled',
      'publish FlightCancelled',
    ]);
  });

  it('US-AD-04-T06 a flight the Catalog will not cancel keeps its bookings and nothing is announced', async () => {
    const { catalog, calls, command } = fixture();
    catalog.statusError = 'INVALID_TRANSITION';
    const { bus, log, audits } = fakeBus();

    const result = await bus.dispatch(command, asAdmin());

    expect(result).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    expect(calls).toEqual([]);
    expect(audits).toEqual([]);
    expect(log).toEqual(['begin', 'rollback']);
  });
});

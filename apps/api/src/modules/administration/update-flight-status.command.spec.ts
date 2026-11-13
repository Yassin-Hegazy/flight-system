import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import { FlightStatus } from '../flight-catalog/index';
import { UpdateFlightStatus, type UpdateFlightStatusInput } from './update-flight-status.command';
import { FakeCatalog, FLIGHT_ID, TX } from './test-support';

const NEW_DEPARTURE = new Date('2027-03-01T07:30:00Z');

function fixture(input: Partial<UpdateFlightStatusInput>, owners: string[] = []) {
  const catalog = new FakeCatalog();
  const asked: { tx: Tx; flightId: string }[] = [];
  const bookingOwners = {
    activeOwnersOf: (tx: Tx, flightId: string) => {
      asked.push({ tx, flightId });
      return Promise.resolve(owners);
    },
  };
  const command = new UpdateFlightStatus(
    catalog.api,
    bookingOwners,
    { flightId: FLIGHT_ID, status: FlightStatus.Boarding, ...input },
    () => 'event-1',
  );
  return { catalog, asked, command };
}

describe('US-AD-02 Update a flight status (command)', () => {
  it("US-AD-02-T01 an illegal transition is the Catalog's decision, surfaced unchanged", async () => {
    const { catalog, command } = fixture({ status: FlightStatus.Arrived });
    catalog.statusError = 'INVALID_TRANSITION';

    expect(await command.execute(TX)).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
  });

  it("US-AD-02-T02 a delay not after the scheduled time is the Catalog's decision, and announces nothing", async () => {
    const { catalog, command } = fixture({
      status: FlightStatus.Delayed,
      estimatedDepartureUtc: new Date('2027-03-01T06:00:00Z'),
    });
    catalog.statusError = 'ESTIMATE_NOT_AFTER_SCHEDULED';

    expect(await command.execute(TX)).toEqual({ ok: false, error: 'ESTIMATE_NOT_AFTER_SCHEDULED' });
  });

  it('US-AD-02-T03 a delay announces FlightDelayed with the affected users and both times', async () => {
    const { catalog, asked, command } = fixture(
      { status: FlightStatus.Delayed, estimatedDepartureUtc: NEW_DEPARTURE },
      ['alice', 'bob'],
    );

    const result = await command.execute(TX);

    expect(catalog.statusChanges).toEqual([
      { tx: TX, id: FLIGHT_ID, next: FlightStatus.Delayed, estimate: NEW_DEPARTURE },
    ]);
    expect(asked).toEqual([{ tx: TX, flightId: FLIGHT_ID }]);
    expect(result).toEqual({
      ok: true,
      value: {
        value: { status: FlightStatus.Delayed, previousStatus: FlightStatus.Scheduled },
        events: [
          {
            type: 'FlightDelayed',
            eventId: 'event-1',
            flightId: FLIGHT_ID,
            flightNumber: 'MS777',
            departureTimeZone: 'Africa/Cairo',
            affectedUserIds: ['alice', 'bob'],
            oldDepartureUtc: '2027-03-01T06:00:00.000Z',
            newDepartureUtc: '2027-03-01T07:30:00.000Z',
          },
        ],
      },
    });
  });

  it('US-AD-02-T06 a change that is not a delay announces nothing', async () => {
    const { asked, command } = fixture({ status: FlightStatus.Boarding });

    expect(await command.execute(TX)).toEqual({
      ok: true,
      value: {
        value: { status: FlightStatus.Boarding, previousStatus: FlightStatus.Scheduled },
        events: [],
      },
    });
    expect(asked).toEqual([]);
  });

  it('US-AD-02-T07 CANCELLED is refused here and changes nothing: it needs the cancel-flight command', async () => {
    const { catalog, command } = fixture({ status: FlightStatus.Cancelled });

    expect(await command.execute(TX)).toEqual({ ok: false, error: 'USE_CANCEL_FLIGHT' });
    expect(catalog.statusChanges).toEqual([]);
  });

  it('US-AD-02-T08 an unknown flight is not found and changes nothing', async () => {
    const { catalog, command } = fixture({ status: FlightStatus.Boarding });
    catalog.flight = null;

    expect(await command.execute(TX)).toEqual({ ok: false, error: 'FLIGHT_NOT_FOUND' });
    expect(catalog.statusChanges).toEqual([]);
  });
});

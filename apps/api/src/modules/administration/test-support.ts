import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import type { Money } from '../../shared/money';
import {
  type AirportError,
  type AirportInput,
  type CatalogApi,
  type ChangeStatusError,
  type CreateFlightError,
  type FareError,
  type FlightInfo,
  FlightStatus,
  type NewFlight,
} from '../flight-catalog/index';
import type { CapacityError, InventoryApi } from '../inventory/index';
import { type Principal, type RequestContext, UserRole } from '../users-access/index';
import { CommandBus } from './command-bus';

/** The transaction object the fakes receive; tests only compare it by identity. */
export const TX = { fake: 'transaction' } as unknown as Tx;

export const FLIGHT_ID = '00000000-0000-4000-8000-0000000000f1';

const user = (role: UserRole): Principal => ({ id: role, email: 'u@x.com', name: 'User', role });
export const asAdmin = (): RequestContext => ({ principal: user(UserRole.Admin) });
export const asTraveler = (): RequestContext => ({ principal: user(UserRole.Traveler) });
export const asAnonymous = (): RequestContext => ({ principal: null });

export const egp = (amountMinor: number) => ({ amountMinor, currency: 'EGP' });

export function newFlight(): NewFlight {
  return {
    flightNumber: 'MS777',
    airlineCode: 'MS',
    originCode: 'CAI',
    destinationCode: 'LHR',
    scheduledDepartureUtc: new Date('2027-03-01T06:00:00Z'),
    scheduledArrivalUtc: new Date('2027-03-01T11:00:00Z'),
    fares: { ECONOMY: egp(1_500_000), BUSINESS: egp(4_500_000) },
  };
}

export function scheduledFlight(): FlightInfo {
  const airport = (code: string, timezone: string) => ({ code, name: code, city: code, timezone });
  return {
    id: FLIGHT_ID,
    flightNumber: 'MS777',
    airline: { code: 'MS', name: 'EgyptAir' },
    origin: airport('CAI', 'Africa/Cairo'),
    destination: airport('LHR', 'Europe/London'),
    scheduledDepartureUtc: new Date('2027-03-01T06:00:00Z'),
    scheduledArrivalUtc: new Date('2027-03-01T11:00:00Z'),
    scheduledDepartureLocal: '2027-03-01T08:00',
    scheduledArrivalLocal: '2027-03-01T11:00',
    durationMinutes: 300,
    status: FlightStatus.Scheduled,
    fares: {},
  };
}

/** The part of the Catalog the commands use, recording every write it is asked to make. */
export class FakeCatalog {
  created: { tx: Tx; flight: NewFlight }[] = [];
  statusChanges: { tx: Tx; id: string; next: FlightStatus; estimate?: Date }[] = [];
  createResult: Result<string, CreateFlightError> = ok(FLIGHT_ID);
  /** Answers for successive createFlight calls; createResult answers once these run out. */
  createResults: Result<string, CreateFlightError>[] = [];
  fares: { tx: Tx; flightId: string; cabin: string; fare: Money }[] = [];
  fareResult: Result<Money, FareError> = ok(egp(1_500_000));
  airports = new Map<string, AirportInput>([
    [
      'CAI',
      { code: 'CAI', name: 'Cairo', city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo' },
    ],
  ]);
  airportError: AirportError | null = null;
  deleteError: 'AIRPORT_NOT_FOUND' | 'AIRPORT_IN_USE' | null = null;
  statusError: ChangeStatusError | null = null;
  flight: FlightInfo | null = scheduledFlight();

  get api(): CatalogApi {
    return this as unknown as CatalogApi;
  }

  getFlightForUpdate() {
    return this.getFlight();
  }

  getFlight(): Promise<FlightInfo | null> {
    return Promise.resolve(this.flight);
  }

  createFlight(tx: Tx, flight: NewFlight): Promise<Result<string, CreateFlightError>> {
    this.created.push({ tx, flight });
    return Promise.resolve(this.createResults.shift() ?? this.createResult);
  }

  setFare(tx: Tx, flightId: string, cabin: string, fare: Money) {
    if (this.fareResult.ok) this.fares.push({ tx, flightId, cabin, fare });
    return Promise.resolve(this.fareResult);
  }

  airport(code: string) {
    return Promise.resolve(this.airports.get(code) ?? null);
  }

  lockAirport(_tx: Tx, code: string) {
    return this.airport(code);
  }

  upsertAirport(_tx: Tx, input: AirportInput): Promise<Result<string, AirportError>> {
    if (this.airportError) return Promise.resolve(err(this.airportError));
    this.airports.set(input.code, input);
    return Promise.resolve(ok(input.code));
  }

  deleteAirport(_tx: Tx, code: string) {
    if (this.deleteError) return Promise.resolve(err(this.deleteError));
    this.airports.delete(code);
    return Promise.resolve(ok(undefined));
  }

  changeStatus(
    tx: Tx,
    id: string,
    next: FlightStatus,
    estimate?: Date,
  ): Promise<Result<FlightStatus, ChangeStatusError>> {
    if (!this.flight) return Promise.resolve(err('FLIGHT_NOT_FOUND'));
    this.statusChanges.push({ tx, id, next, estimate });
    // Like the real Catalog, a successful change answers with the status the flight had before.
    return Promise.resolve(this.statusError ? err(this.statusError) : ok(this.flight.status));
  }
}

/** The part of Inventory the commands use. */
export class FakeInventory {
  capacities: { tx: Tx; flightId: string; cabin: string; capacity: number }[] = [];
  capacityResult: Result<void, CapacityError> = ok(undefined);
  /** Answers changeCapacity with the capacity it replaced, or Inventory's refusal. */
  changeResult: Result<number, CapacityError> = ok(3);

  get api(): InventoryApi {
    return this as unknown as InventoryApi;
  }

  setCapacity(
    tx: Tx,
    flightId: string,
    cabin: string,
    capacity: number,
  ): Promise<Result<void, CapacityError>> {
    this.capacities.push({ tx, flightId, cabin, capacity });
    return Promise.resolve(this.capacityResult);
  }

  changeCapacity(
    tx: Tx,
    flightId: string,
    cabin: string,
    capacity: number,
  ): Promise<Result<number, CapacityError>> {
    if (this.changeResult.ok) this.capacities.push({ tx, flightId, cabin, capacity });
    return Promise.resolve(this.changeResult);
  }
}

/**
 * A CommandBus over a fake transaction. The log records begin, commit, rollback and each
 * published event type; audits holds what the bus appended to the audit log.
 */
export function fakeBus() {
  const log: string[] = [];
  const audits: { actorId: string; action: string; changes: unknown }[] = [];
  const dataSource = {
    transaction: async (_isolation: string, work: (tx: Tx) => Promise<unknown>) => {
      log.push('begin');
      try {
        const value = await work(TX);
        log.push('commit');
        return value;
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
  };
  const events = {
    emitAsync: (type: string) => {
      log.push(`publish ${type}`);
      return Promise.resolve([]);
    },
  };
  const auditLog = {
    append: (_tx: Tx, actorId: string, action: string, changes: unknown) => {
      audits.push({ actorId, action, changes });
      return Promise.resolve();
    },
  };
  const bus = new CommandBus(dataSource as never, events as never, auditLog as never);
  return { bus, log, audits };
}

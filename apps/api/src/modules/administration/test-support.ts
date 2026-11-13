import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import {
  type CatalogApi,
  type ChangeStatusError,
  type CreateFlightError,
  type FlightInfo,
  FlightStatus,
  type NewFlight,
} from '../flight-catalog/index';
import type { CapacityError, InventoryApi } from '../inventory/index';
import { type Principal, type RequestContext, UserRole } from '../users-access/index';

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
    return Promise.resolve(this.createResult);
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
}

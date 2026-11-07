import { formatLocal } from '../../shared/time';
import type { AirportInfo, FlightInfo } from './catalog-api';
import type { AirlineRecord, AirportRecord, FareRecord } from './catalog.repository';
import type { Flight } from './flight';
import type { Fare } from './pricing';
import type { Cabin } from './value-objects';

export interface ReferenceData {
  airports: ReadonlyMap<string, AirportRecord>;
  airlines: ReadonlyMap<string, AirlineRecord>;
  faresByFlight: ReadonlyMap<string, FareRecord[]>;
}

/** Builds what other modules see of a flight. Local times use each airport's own time zone. */
export function toFlightInfo(flight: Flight, reference: ReferenceData): FlightInfo {
  const id = flight.id;
  const origin = reference.airports.get(flight.route.origin.value);
  const destination = reference.airports.get(flight.route.destination.value);
  const airline = reference.airlines.get(flight.airlineCode);
  if (!id || !origin || !destination || !airline) {
    // Foreign keys make this impossible for stored flights; reaching it is a data integrity bug.
    throw new Error(`Flight ${id ?? '(unsaved)'} references missing catalog data`);
  }

  const fares: Partial<Record<Cabin, Fare>> = {};
  for (const record of reference.faresByFlight.get(id) ?? []) fares[record.cabin] = record.fare;

  return {
    id,
    flightNumber: flight.number.value,
    airline: { code: airline.code, name: airline.name },
    origin: airportInfo(origin),
    destination: airportInfo(destination),
    scheduledDepartureUtc: flight.scheduledDepartureUtc,
    scheduledArrivalUtc: flight.scheduledArrivalUtc,
    scheduledDepartureLocal: formatLocal(flight.scheduledDepartureUtc, origin.timezone),
    scheduledArrivalLocal: formatLocal(flight.scheduledArrivalUtc, destination.timezone),
    durationMinutes: flight.durationMinutes,
    estimatedDepartureUtc: flight.estimatedDepartureUtc ?? undefined,
    status: flight.status,
    cancelReason: flight.cancelReason ?? undefined,
    fares,
  };
}

function airportInfo(airport: AirportRecord): AirportInfo {
  return { code: airport.code, name: airport.name, city: airport.city, timezone: airport.timezone };
}

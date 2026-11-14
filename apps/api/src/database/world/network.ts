import type { NewFlight } from '../../modules/flight-catalog/index';
import type { Cabin } from '../../modules/flight-catalog/index';
import { WORLD_AIRPORTS, type WorldAirport } from './airports';

/** How many days ahead the world schedule reaches, starting tomorrow. */
export const WORLD_DAYS = 14;

/** The hub airports and the airline based at each. */
export const HUBS: Record<string, string> = {};

/** A flight to create, with the seats to give each cabin. */
export interface WorldFlight extends NewFlight {
  seats: Record<Cabin, number>;
}

export function buildWorldFlights(
  now: Date,
  days = WORLD_DAYS,
  airports: readonly WorldAirport[] = WORLD_AIRPORTS,
): WorldFlight[] {
  void now;
  void days;
  void airports;
  return [];
}

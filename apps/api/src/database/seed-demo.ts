import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CATALOG_API, type CatalogApi, type NewFlight } from '../modules/flight-catalog/index';
import { USERS_API, type UsersApi } from '../modules/users-access/index';
import { money } from '../shared/money';
import { seedAdmin, type AdminSeed, type SeedOutcome } from './seed-admin';

/** How many days ahead the demo schedule reaches, starting tomorrow. */
export const DEMO_DAYS = 14;

export interface DemoRoute {
  /** The flight number, whose first two characters are the airline code. */
  number: string;
  airline: string;
  origin: string;
  destination: string;
  /** The origin airport's IANA time zone, used to check the one-number-per-local-day rule. */
  timeZone: string;
  /** Departure time of day, in UTC. */
  departsUtc: string;
  durationMinutes: number;
  /** Adult fares in EGP minor units (piastres): 1500000 is 15,000.00 EGP. */
  economy: number;
  business: number;
}

const CAIRO = 'Africa/Cairo';

/**
 * A small, realistic daily schedule across the airports and airlines the reference-data migration
 * already provides, with return legs so a traveler can book both directions.
 */
export const DEMO_ROUTES: DemoRoute[] = [
  {
    number: 'MS777',
    airline: 'MS',
    origin: 'CAI',
    destination: 'LHR',
    timeZone: CAIRO,
    departsUtc: '06:00',
    durationMinutes: 300,
    economy: 1_500_000,
    business: 6_000_000,
  },
  {
    number: 'MS778',
    airline: 'MS',
    origin: 'LHR',
    destination: 'CAI',
    timeZone: 'Europe/London',
    departsUtc: '13:00',
    durationMinutes: 285,
    economy: 1_450_000,
    business: 5_800_000,
  },
  {
    number: 'MS985',
    airline: 'MS',
    origin: 'CAI',
    destination: 'JFK',
    timeZone: CAIRO,
    departsUtc: '20:45',
    durationMinutes: 695,
    economy: 3_200_000,
    business: 12_500_000,
  },
  {
    number: 'EK924',
    airline: 'EK',
    origin: 'CAI',
    destination: 'DXB',
    timeZone: CAIRO,
    departsUtc: '03:15',
    durationMinutes: 240,
    economy: 1_900_000,
    business: 7_400_000,
  },
  {
    number: 'EK925',
    airline: 'EK',
    origin: 'DXB',
    destination: 'CAI',
    timeZone: 'Asia/Dubai',
    departsUtc: '08:00',
    durationMinutes: 255,
    economy: 1_850_000,
    business: 7_200_000,
  },
  {
    number: 'QR1301',
    airline: 'QR',
    origin: 'CAI',
    destination: 'DOH',
    timeZone: CAIRO,
    departsUtc: '05:20',
    durationMinutes: 210,
    economy: 1_700_000,
    business: 6_800_000,
  },
  {
    number: 'TK695',
    airline: 'TK',
    origin: 'CAI',
    destination: 'IST',
    timeZone: CAIRO,
    departsUtc: '10:10',
    durationMinutes: 140,
    economy: 1_300_000,
    business: 5_200_000,
  },
  {
    number: 'LH581',
    airline: 'LH',
    origin: 'CAI',
    destination: 'FRA',
    timeZone: CAIRO,
    departsUtc: '06:45',
    durationMinutes: 270,
    economy: 1_650_000,
    business: 6_600_000,
  },
  {
    number: 'AF1235',
    airline: 'AF',
    origin: 'CAI',
    destination: 'CDG',
    timeZone: CAIRO,
    departsUtc: '07:30',
    durationMinutes: 280,
    economy: 1_600_000,
    business: 6_400_000,
  },
  {
    number: 'MS901',
    airline: 'MS',
    origin: 'CAI',
    destination: 'JED',
    timeZone: CAIRO,
    departsUtc: '08:30',
    durationMinutes: 150,
    economy: 900_000,
    business: 3_600_000,
  },
  {
    number: 'SV302',
    airline: 'SV',
    origin: 'JED',
    destination: 'CAI',
    timeZone: 'Asia/Riyadh',
    departsUtc: '15:00',
    durationMinutes: 140,
    economy: 950_000,
    business: 3_800_000,
  },
  {
    number: 'SM331',
    airline: 'SM',
    origin: 'CAI',
    destination: 'HRG',
    timeZone: CAIRO,
    departsUtc: '09:00',
    durationMinutes: 70,
    economy: 250_000,
    business: 800_000,
  },
  {
    number: 'SM332',
    airline: 'SM',
    origin: 'HRG',
    destination: 'CAI',
    timeZone: CAIRO,
    departsUtc: '11:30',
    durationMinutes: 70,
    economy: 250_000,
    business: 800_000,
  },
  {
    number: 'NP101',
    airline: 'NP',
    origin: 'CAI',
    destination: 'SSH',
    timeZone: CAIRO,
    departsUtc: '12:00',
    durationMinutes: 75,
    economy: 270_000,
    business: 850_000,
  },
  {
    number: 'NP102',
    airline: 'NP',
    origin: 'SSH',
    destination: 'CAI',
    timeZone: CAIRO,
    departsUtc: '14:30',
    durationMinutes: 75,
    economy: 270_000,
    business: 850_000,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The demo schedule: every route once a day, from tomorrow for DEMO_DAYS days. Pure, so the same
 * moment always gives the same flights and a re-run only meets duplicates.
 */
export function buildDemoFlights(now: Date, days = DEMO_DAYS): NewFlight[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const flights: NewFlight[] = [];
  for (let offset = 1; offset <= days; offset += 1) {
    for (const route of DEMO_ROUTES) {
      const [hours, minutes] = route.departsUtc.split(':').map(Number);
      const departure = new Date(todayUtc + offset * DAY_MS + (hours * 60 + minutes) * 60_000);
      flights.push({
        flightNumber: route.number,
        airlineCode: route.airline,
        originCode: route.origin,
        destinationCode: route.destination,
        scheduledDepartureUtc: departure,
        scheduledArrivalUtc: new Date(departure.getTime() + route.durationMinutes * 60_000),
        fares: {
          ECONOMY: money(route.economy, 'EGP'),
          BUSINESS: money(route.business, 'EGP'),
        },
      });
    }
  }
  return flights;
}

export interface FlightSeedResult {
  created: number;
  /** Already in the database from an earlier run. */
  existing: number;
  /** Flights the Catalog refused, with its reason; empty when the seed is healthy. */
  rejected: { flightNumber: string; departure: string; reason: string }[];
}

/** Schedules the demo flights through the Catalog's own rules. Safe to run again. */
export async function seedDemoFlights(
  app: INestApplicationContext,
  now = new Date(),
): Promise<FlightSeedResult> {
  const catalog = app.get<CatalogApi>(CATALOG_API);
  const dataSource = app.get(DataSource);
  const result: FlightSeedResult = { created: 0, existing: 0, rejected: [] };

  for (const flight of buildDemoFlights(now)) {
    const outcome = await dataSource.transaction((tx) => catalog.createFlight(tx, flight));
    if (outcome.ok) result.created += 1;
    else if (outcome.error === 'DUPLICATE_FLIGHT') result.existing += 1;
    else {
      result.rejected.push({
        flightNumber: flight.flightNumber,
        departure: flight.scheduledDepartureUtc.toISOString(),
        reason: outcome.error,
      });
    }
  }
  return result;
}

export interface DemoSeedInput {
  admin: AdminSeed;
  traveler: AdminSeed;
  now?: Date;
}

export interface DemoSeedSummary {
  admin: SeedOutcome;
  traveler: SeedOutcome;
  flights: FlightSeedResult;
}

/** An administrator, a demo traveler and two weeks of flights: a database ready to demonstrate. */
export async function seedDemo(
  app: INestApplicationContext,
  input: DemoSeedInput,
): Promise<DemoSeedSummary> {
  const admin = await seedAdmin(app, input.admin);

  const users = app.get<UsersApi>(USERS_API);
  const registered = await users.register(input.traveler);
  if (!registered.ok && registered.error !== 'EMAIL_TAKEN') {
    throw new Error(
      'The demo traveler password must be at least 10 characters and at most 72 bytes',
    );
  }

  const flights = await seedDemoFlights(app, input.now);
  return { admin, traveler: registered.ok ? 'created' : 'already-exists', flights };
}

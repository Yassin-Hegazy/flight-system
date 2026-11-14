# Booking

**Owner:** @owner-booking (placeholder)

**Purpose:** Bookings, passengers and the booking lifecycle.

## What it owns

| Table                 | Holds                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| `bookings`            | Reference, owner, status, total and currency snapshot, hold expiry, cancel reason |
| `booking_segments`    | Flight, cabin and hold per leg (one leg now, two for round trips later)           |
| `booking_passengers`  | Passengers copied in (never linked to a profile) with their fare snapshot         |
| `booking_history`     | Every status transition with time and cause                                       |
| `booking_idempotency` | Which booking an `Idempotency-Key` produced, kept for 24 hours                    |

## HTTP routes

| Route                              | Story        | Notes                                                                                                                                       |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings`                   | US-BK-01, 03 | `passengers` (1 to 9), optional `displayedTotal`, optional `Idempotency-Key` header. Without `passengers` the signed-in user travels alone. |
| `GET /bookings`                    | US-BK-06     | `{ upcoming, past }`; `?includeExpired=true` shows expired ones.                                                                            |
| `GET /bookings/:reference`         | US-BK-04     | Owner only; anyone else gets the same 404 as an unknown reference.                                                                          |
| `POST /bookings/:reference/cancel` | US-BK-05     | Idempotent. Paid bookings close 24 h before departure.                                                                                      |

There is no route that accepts a status (US-BK-02 AC-3).

## Public API (`index.ts`)

- `BOOKING_PAYMENTS`: `getPayable` and `confirmPaid` for Payments.
- `BOOKING_OWNERS`: `activeOwnersOf(tx, flightId)` for Administration's flight events.
- `BOOKING_TICKETING`: `getForTicketing` and `markTicketed(tx, id)` for Ticketing (CONFIRMED to TICKETED).
- `BOOKING_EXPIRY`: `expireOverdue(now)`, called every minute by `BookingExpiryJob`.
- `FLIGHT_BOOKING_CANCELLATION`: `cancelForFlight(tx, flightId)` for an airline cancellation.
- `BookingPassengers`: every passenger on the paid bookings of a flight, for the manifest.

## How it is built

- **State pattern** (`booking-state.ts`): each status is a class that overrides only its legal moves;
  the base class rejects everything else. The 24-hour rule lives in `Confirmed` and `Ticketed`.
  The classes are pure, so `booking-state.spec.ts` needs no database.
- **Use cases** (one per action): `CreateBooking`, `BookingQueries`, `CancelBookings`,
  `ExpireBookings`. `BookingService` only serves the other modules.
- **Declarative and imperative**: `passenger-rules.ts` declares what a valid passenger is;
  `CreateBooking` is a strict sequence (replay, cheap rules, then the atomic part).
- **Atomic writes**: the booking, its segment, passengers, history, idempotency record and seat hold
  commit together. Cancellation commits the status, seat release, ticket voiding and refund record
  together; the refund is sent to the gateway after commit.
- The migration adds no foreign keys on the new tables (see its comment): other modules' tests
  reset the database with a fixed `TRUNCATE` list.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

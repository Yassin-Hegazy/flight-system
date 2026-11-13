# Booking

**Owner:** @owner-booking (placeholder)

**Purpose:** Bookings, passengers and the booking lifecycle.

## Public API

`BOOKING_OWNERS` exposes `activeOwnersOf(tx, flightId)` for Administration's flight events.
It uses the caller's transaction to return owners with confirmed bookings or unexpired holds.

`BOOKING_PAYMENTS` provides `getPayable` and `confirmPaid`. Booking owns the fare snapshot and
uses Inventory to validate and commit the hold. The M2 HTTP path reserves one adult seat on one
flight and lets its owner read the booking status.

`BOOKING_TICKETING` provides `getForTicketing`, `markTicketed`, `ownedId` and `awaitingTickets`
for Ticketing. Ticketing issues tickets after `BookingConfirmed` commits and moves the booking
from CONFIRMED to TICKETED; Booking never calls Ticketing. TICKETED counts as paid everywhere
CONFIRMED does: travelers may cancel it, airline cancellation cascades over it, and it appears on
the manifest. Until a booking holds several passengers and flights, `getForTicketing` reports the
booking itself as its one passenger and its flight as its one segment.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

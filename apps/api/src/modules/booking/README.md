# Booking

**Owner:** @owner-booking (placeholder)

**Purpose:** Bookings, passengers and the booking lifecycle.

## Public API

`BOOKING_OWNERS` exposes `activeOwnersOf(tx, flightId)` for Administration's flight events.
The scaffold returns an empty list. Once Booking persists bookings, use the caller's transaction
to return the owners of active bookings for the flight.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

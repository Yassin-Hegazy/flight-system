# Administration

**Owner:** @owner-administration (placeholder)

**Purpose:** Administrative operations on flights, capacity and fares.

## Public API

`index.ts` exports only `AdministrationModule`. No other module calls Administration; it is reached
through its own routes, and it announces changes with domain events.

| Route                             | Command              | Story    |
| --------------------------------- | -------------------- | -------- |
| `POST /admin/flights`             | `CreateFlight`       | US-AD-01 |
| `PATCH /admin/flights/:id/status` | `UpdateFlightStatus` | US-AD-02 |

Both need an administrator: 401 when nobody is signed in, 403 for a traveler.

## Design pattern: Command

Written with the roles the lecture gives the pattern:

| Lecture role      | Here                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `ICommand`        | `AdminCommand`, with one method `execute(tx)`                              |
| `ConcreteCommand` | `CreateFlight`, `UpdateFlightStatus`: built with their receivers and input |
| `Receiver`        | The modules that do the work: `CatalogApi`, `InventoryApi`                 |
| `Invoker`         | `CommandBus.dispatch(command, ctx)`                                        |
| Client            | `AdministrationController`: builds the command from the request            |

The bus runs every command the same way and knows nothing about any one of them:

1. signed in (401) and an administrator (403), through the Users and Access decorators;
2. `command.execute(tx)` inside one READ COMMITTED transaction; an expected failure (a `Result`
   error) or a thrown error rolls everything back;
3. the command's events, published only after that transaction has committed.

A new operation is a new command class and a route; the bus does not change.

Administration owns no flight or seat rules. `CreateFlight` asks the Catalog whether the flight is
valid and Inventory to set each cabin's capacity; `UpdateFlightStatus` asks the Catalog whether the
transition is allowed. Input shape (types, ranges, instants with a zone) is declared in
`administration.dto.ts`.

## Not built yet

- `BOOKING_OWNERS` is bound to `NoBookingsYet`, so `FlightDelayed` carries no recipients. Bind it
  to Booking's API when the Booking module exists.
- The audit log (US-AD-07) and the other Final stories. When the audit log is added, the bus
  appends the entry in the same transaction, between steps 2 and 3.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

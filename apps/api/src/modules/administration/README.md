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

## M2 demo in Swagger

1. Run `pnpm install`, `pnpm bootstrap`, then `pnpm --filter api dev` from the repository root.
   Check `GET /health` for `database: connected` and open <http://localhost:3001/docs>.
2. Execute `POST /users/sign-in` with the administrator credentials printed by bootstrap. The
   browser keeps the `flight_session` cookie. In Postman, keep the cookie and send
   `X-Requested-With: postman` on write requests. Swagger adds that header automatically.
3. Execute `POST /admin/flights` with the Swagger example. Use a future date, keeping both dates
   on the same day for this example. Pick an unused flight number or date when repeating the demo.
   Expect 201 and copy the returned `id`.
4. Execute `GET /flights` with origin `CAI`, destination `LHR`, and the Cairo departure date
   in `YYYY-MM-DD`. Find the created ID and verify its two fares and `SCHEDULED` status.
5. Execute `PATCH /admin/flights/{id}/status` with `DELAYED` and an estimate later than the
   scheduled departure. Expect 200 with `status: DELAYED` and `previousStatus: SCHEDULED`.
   Confirm the estimate with `GET /flights/{id}`. An attempted `DELAYED → ARRIVED` returns 409.
6. Sign in as the seeded traveler and repeat the create request. Expect 403.

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
3. the command's events, published only after that transaction has committed. If an observer
   fails, the bus logs the event ID and returns the committed result.

A new operation is a new command class and a route; the bus does not change.

Administration owns no flight or seat rules. `CreateFlight` asks the Catalog whether the flight is
valid and Inventory to set each cabin's capacity; `UpdateFlightStatus` asks the Catalog whether the
transition is allowed. The Catalog uses the same transaction for the reads and writes made during
the command. Input shape (required nested objects, integer ranges and valid instants with a zone)
is declared in `administration.dto.ts`. The command classes specify the order of the work.

## Individual questions

- **Who does what in the Command pattern?** The controller builds the command, the bus invokes
  it, and Catalog and Inventory enforce their domain rules as receivers. The bus owns the
  authorization and transaction sequence once for every command.
- **What if Inventory fails or Notifications throws?** Inventory runs before commit, so its
  failure rolls back the flight and seats. Notifications observes the event after commit, so an
  observer failure is logged and the saved status is still returned.

## Remaining dependencies

- Booking currently provides an empty owner lookup. The integration test supplies a traveler
  ID through that public port and checks the real Notifications inbox. Live recipient lookup
  needs Booking to persist bookings and return their active owners.
- The append-only audit trail (US-AD-07) and dedicated flight cancellation (US-AD-04) are Final
  stories in S2.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

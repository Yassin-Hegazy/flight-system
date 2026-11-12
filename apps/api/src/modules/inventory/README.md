# Inventory

**Owner:** @owner-inventory (placeholder)

**Purpose:** Cabin capacity, seat holds and availability.

## Public API

FBS-21 / US-INV-01 provides read-only, genuine availability. Import `InventoryModule` in the
consuming Nest module and inject `INVENTORY_API` with the `InventoryApi` interface. Both are
exported from `index.ts`, alongside `InventoryFacade`, `AvailabilityRequest`, `Availability`,
and `AvailabilityError`. The token resolves to the same singleton as `InventoryFacade`.
Services, repositories and entities stay private.

```ts
import { Inject, Injectable, Module } from '@nestjs/common';
import { INVENTORY_API, InventoryModule, type InventoryApi } from '../inventory/index';

@Injectable()
class AvailabilityConsumer {
  constructor(@Inject(INVENTORY_API) private readonly inventory: InventoryApi) {}

  check(flightId: string) {
    return this.inventory.checkAvailability([
      { flightId, cabin: 'ECONOMY', passengers: { adults: 2, children: 1, infants: 1 } },
      { flightId, cabin: 'BUSINESS', passengers: { adults: 2 } },
    ]);
  }
}

@Module({ imports: [InventoryModule], providers: [AvailabilityConsumer] })
class ConsumerModule {}
```

`checkAvailability(requests, tx?)` returns `Promise<Result<Availability[], AvailabilityError>>`.
Each result contains `flightId`, `cabin`, `availableSeats`, `requiredSeats`, `canAccommodate`,
and `inventoryFound`. Results preserve request order and duplicates; UUIDs are normalized to
lowercase. Duplicate requests are independent checks, not a combined seat allocation.

- Cabin uses Catalog's `Cabin` (`ECONOMY` or `BUSINESS`).
- Passengers use Catalog's `PassengerMix`: nonnegative safe integer counts, at least one adult
  or child, and at most one lap infant per adult. Adults plus children determine required seats;
  infants never consume seats. Optional counts default to zero. The seat total must be a safe integer.
- Malformed input returns `INVALID_REQUEST`, `INVALID_FLIGHT_ID`, `INVALID_CABIN`,
  `INVALID_PARTY`, or `TOO_MANY_INFANTS`. One invalid item rejects the whole batch before querying.
- An empty batch returns `ok([])` without querying. Missing inventory returns zero seats,
  `inventoryFound: false`, and `canAccommodate: false`; it does not invent capacity from fares.
- Availability is `max(0, capacity - committedSeats - activeHeldSeats)`, independently per cabin.
  Only `HELD` rows with `expiresAt > now` count. Exactly-now and expired holds are excluded even
  when their persisted status is still `HELD`.
- One aggregate SQL statement reads all requested flights, with one instant from the shared
  injectable `CLOCK`. There is no per-flight query loop or availability cache.
- Passing a shared `Tx` uses that transaction's manager, including its uncommitted changes.
  Without it, the default manager is used. This is a snapshot read, not a lock or reservation;
  future booking writes must enforce concurrency in their own transactional hold operation.
  Catalog remains responsible for flight existence and operational bookability.

## Schema and implementation

`1794355200000-CreateInventory.ts` creates only Inventory-owned tables and enum types:

| Table             | Keys and fields                                                                                        | Constraints and indexes                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cabin_inventory` | Composite primary key (`flightId` UUID, `cabin`); integer `capacity`, `committedSeats` (default 0)     | Capacity >= 0; committed seats between 0 and capacity                                                                                  |
| `seat_holds`      | Generated UUID `id`; UUID `bookingId`, `flightId`; `cabin`, integer `seats`, `status`, UTC `expiresAt` | Seats > 0; internal composite FK to cabin inventory; booking index; partial HELD indexes on (flightId, cabin, expiresAt) and expiresAt |

`inventory_cabin_enum` contains `ECONOMY` and `BUSINESS`. `seat_hold_status_enum` contains
`HELD`, `COMMITTED`, `RELEASED`, and `EXPIRED`. Flight and booking identifiers remain plain UUID
columns with no cross-module entity relationships. Migration
`1794441600000-AddInventoryFlightForeignKey.ts` adds the database-only
`cabin_inventory_flight_fk`: `cabin_inventory."flightId"` references `flights."id"` with
`ON DELETE RESTRICT ON UPDATE NO ACTION`. PostgreSQL rejects nonexistent flight IDs and prevents
deleting or changing a flight ID while Inventory references it. Booking IDs still have no foreign
key. The existing internal Inventory-to-holds FK is unchanged. Multiple holds for a booking are
allowed for multiple flights and future hold history.

The facade delegates to `InventoryService` for validation and result shaping. The service uses
the private `InventoryRepository` interface; `PgInventoryRepository` owns the availability SQL.
`InventoryModule` registers its two entities and follows the project's token/`useExisting` DI
convention. The original `CreateInventory` migration's `down` removes only these tables and enums.

### Flight foreign-key migration and schema verification

The new migration follows Catalog creation (`1794029663383`) and Inventory creation
(`1794355200000`); it does not edit either migration. Its `up` locks the two tables against
concurrent writes, checks for orphaned Inventory rows, and creates a fully validated foreign key
in one atomic PostgreSQL statement. Reads may continue, but writes wait while the migration runs;
schedule it accordingly for a populated database. Existing valid rows are preserved.

If orphans exist, the migration fails with SQLSTATE `23503`, the constraint name, an example
missing flight UUID, and a remediation hint. It never deletes, rewrites, or invents data. An
operator must review the source of the orphaned records and explicitly decide how to resolve
them before retrying. To inspect all orphans before deployment:

```sql
SELECT inventory.*
FROM cabin_inventory inventory
LEFT JOIN flights flight ON flight.id = inventory."flightId"
WHERE flight.id IS NULL;
```

The new migration's `down` drops only `cabin_inventory_flight_fk`. All tables, rows, indexes,
and other constraints remain. Reverting Inventory table creation requires reverting this FK
migration first; tests cover both the FK-only reversal and the two-migration sequence.

**Migration-generation limitation:** `synchronize: false` prevents startup schema changes, but
does not make TypeORM's schema generator ignore database-only constraints. In TypeORM 1.1.1,
`@ForeignKey('flights', ...)` would still require loading the referenced entity metadata; no such
metadata coupling is added here. The existing generator therefore proposes this unwanted line:

```sql
ALTER TABLE "cabin_inventory" DROP CONSTRAINT "cabin_inventory_flight_fk";
```

For every future generated migration, review the SQL and remove that proposed DROP and its
matching rollback ADD before committing. Do not apply unreviewed generated migrations or enable
schema synchronization. The generator is not automatically filtered or patched by this correction.

The schema-parity test remains strict: it independently checks the FK's exact database definition,
validation status, non-deferrability, target and actions, then asserts the **entire** TypeORM diff
is exactly the single expected DROP above. No other discrepancy is allowed. Removing the FK,
changing its definition, or introducing other schema drift fails this check. Insert, update and
delete tests also enforce the relationship. The existing CI runs these tests after applying all
migrations, so an accidental generated removal cannot pass the integration suite silently.

FBS-22, FBS-23 and FBS-24 are not implemented: there are no hold creation/commit/release commands,
expiration jobs, capacity administration endpoints, or Search/Booking changes. Status fields and
indexes prepare for that work without claiming to enforce future allocation/idempotency rules.

## Verification and acceptance criteria

Unit tests: `src/modules/inventory/inventory.service.spec.ts`.
PostgreSQL tests: `test/inventory.int-spec.ts`, using the existing `startTestDatabase()` helper
and migrations, with an overridden clock. Integration tests access Inventory only via `index.ts`;
SQL inserts are test fixtures, not a public write API.

| Acceptance criterion      | Test IDs                              | Coverage                                                                                                                                     |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 Genuine availability | T01, T02, T05, T06, T08, T10–T14, U05 | Arithmetic, all hold statuses, nonnegative totals, missing/zero capacity, DB constraints, transactions, schema parity and migration reversal |
| AC-2 Cabins/passengers    | T02, T03, T09, U02, U03               | Cabin isolation, different seat counts, lap infants, invalid inputs                                                                          |
| AC-3 Expired reservations | T04                                   | Past, exact timestamp, future, and advancing clock without cleanup                                                                           |
| AC-4 Public API           | T01, T02, T07–T09, T12, U01–U04       | Separate consumer module, exported facade, one-query batches, empty input, validation, caller transaction                                    |

Foreign-key correction coverage: T15 accepts real Catalog flight references; T16 rejects unknown
UUIDs without persisting an orphan; T17 blocks deletion; T18 verifies FK-only rollback/reapply
preserves data and schema objects; T19 verifies failed orphan preflight preserves records and
migration history; T20 provisions a flight created through `CATALOG_API` and verifies existing
HTTP reads/Swagger metadata; T21 rejects invalid reference updates. T01–T12 retain the original
availability assertions, now using real flights and the seeded MS/CAI/LHR reference data.

## M2 Demonstration Readiness

- Existing backend HTTP routes include `GET /health`, `GET /flights`, `GET /flights/:id`,
  `GET /flights/airports/suggestions`, and Users/Access routes. They can be exercised with Postman;
  the normal application bootstrap publishes Swagger at `/docs`. T20 specifically checks a
  provisioned Catalog flight still appears in the flight list and detail endpoint.
- Inventory availability is currently an internal Nest Facade. The PostgreSQL integration suite
  demonstrates its real calculations, DI boundary and database constraints, but there is no
  Inventory HTTP controller or Search/Booking route exposing availability to Swagger/Postman.
  That HTTP integration remains a **separate team requirement** for a live availability API demo;
  it is not added by this correction. Confirm the intended demo format with the TA.
- Apply migrations first. Reference-data migrations seed airlines and airports, **not flights or
  inventory**. Demo setup must create valid flights (including their route, schedule and any fares
  required for the scenario), then populate cabin inventory using those actual UUIDs, then any
  hold fixtures. `CATALOG_API.createFlight()` is an existing internal creation path; no flight
  creation HTTP endpoint or Inventory provisioning API is added here. Random UUIDs alone are no
  longer sufficient for Inventory fixtures. The FK introduces no other seed-data requirement.
- Prepare both cabins and representative committed/active/expired hold values. Set hold expiry
  relative to the demonstration time. Arrange demo data in a dedicated database using a reviewed
  seed process; clean up holds, then inventory, before deleting referenced flights. No persistent
  demo database has been seeded by these tests, which use disposable Testcontainers databases.
- For individual questions, be ready to explain the availability formula and strict expiry check,
  lap-infant handling, batch query, Facade/DI boundary, database-only FK, migration preflight and
  rollback, schema-diff limitation, and the PostgreSQL regression tests. No frontend is required.

Run from the repository root: `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm test`,
`pnpm test:integration` (Docker required), `pnpm build`, and `git diff --check`.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

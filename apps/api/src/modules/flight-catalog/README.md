# Flight Catalog

**Owner:** @owner-flight-catalog (placeholder)

**Purpose:** Flights, airports, schedules and operational status.

## Public API

Other modules inject `CATALOG_API` and depend on the `CatalogApi` interface from `index.ts`, never
on the service class.

| Call                                             | Who uses it     | Notes                                                     |
| ------------------------------------------------ | --------------- | --------------------------------------------------------- |
| `getFlight(id)`                                  | any module      | `null` when the flight does not exist                     |
| `findFlights(route, localDate)`                  | Search          | one calendar day at the origin airport                    |
| `searchAirports(query)`                          | Search, web     | 2+ characters, at most 10, exact code first               |
| `isBookable(flight, now)`                        | Search, Booking | pure: SCHEDULED or DELAYED, more than 2 h out             |
| `priceParty(flight, cabin, party)`               | Search, Booking | pure: adults 100%, children 75%, infants 10%              |
| `createFlight(tx, input)`                        | Administration  | flight plus both cabin fares, in the caller's transaction |
| `changeStatus(tx, id, next, estimate?, reason?)` | Administration  | returns the previous status                               |
| `setFare(tx, id, cabin, fare)`                   | Administration  | returns the fare it replaced                              |
| `upsertAirport(tx, input)`                       | Administration  | validates the IANA time zone                              |

Expected failures are returned as `Result` error codes, not thrown. Money is integer minor units
(`shared/money.ts`); times are UTC instants plus airport-local strings with their offset.

## Inside the module

- `value-objects.ts`, `flight-status.ts`, `flight.ts`, `pricing.ts`: the rules. `fareRuleFor()` is a
  Simple Factory mapping each passenger type to its fare rule.
- `catalog.repository.ts`: the `CatalogRepository` interface (Repository pattern).
  `pg-catalog.repository.ts` is the only file with SQL for this module's tables;
  `in-memory-catalog.repository.ts` replaces it in unit tests.
- `flight-catalog.service.ts`: the use cases (load, apply the rule, save).
- `flight-catalog.controller.ts`: public read routes under `/flights`.

Airlines and airports are seeded by the `SeedCatalogReferenceData` migration.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

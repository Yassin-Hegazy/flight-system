# Search

**Owner:** @owner-search (placeholder)

**Purpose:** Flight search and comparison: turning a traveler's question ("Cairo to London on
10 December, two adults, Economy") into a ranked list of flights that can genuinely be booked,
priced for the whole party.

Search owns **no tables and no entities**. It asks the Catalog what flights exist and what they
cost, and Inventory which have room, through their public interfaces only. Its own rules are what
counts as a valid query and how results are filtered, ordered and paged.

## Public API

Other modules inject `SEARCH_API` and depend on the `SearchApi` interface from `index.ts`. Today
only Search's own routes call it. `index.ts` also exports the criteria and result **types**, but no
classes.

| Call                        | Returns                                      | Notes                                  |
| --------------------------- | -------------------------------------------- | -------------------------------------- |
| `searchOneWay(criteria)`    | `Result<ResultPage, SearchError>`            | one route, one local day at the origin |
| `searchRoundTrip(criteria)` | `Result<{ outbound, inbound }, SearchError>` | two independent legs                   |
| `sortKeys()`                | `SortKey[]`                                  | the registered sort orders, in order   |

A `ResultPage` is `{ items, page, pageSize, total, hasNext, sort, filters }`. Each item is a
`SearchResult`. Money is integer minor units (`{ amountMinor, currency }`), and times are the
Catalog's UTC instants plus airport-local strings with their offset. Formatting is the UI's job.

| Route                    | Query                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /search/flights`    | `origin`, `destination`, `date`, `adults`, `children`, `infants`, `cabin`, `sort`, `maxTotal`, `departFrom`, `departTo`, `airlines`, `page`, `pageSize` |
| `GET /search/round-trip` | the same, plus `returnDate`, `outboundSort`, `inboundSort`, `outboundPage`, `inboundPage` (no `sort` / `page`)                                          |

Both routes are public. In a round trip, each leg has its own sort and page, while the filters and
the page size apply to both legs (US-FS-06 AC-2).

Expected failures are returned as `Result` codes and the controller maps each one to a 400 in the
shared error shape. The 400 includes the query field the error belongs to, so the form can show it
beside that field: `SAME_AIRPORT`, `UNKNOWN_AIRPORT`, `INVALID_DATE`, `DATE_IN_PAST`,
`INVALID_PASSENGERS`, `UNSUPPORTED_SORT` (the message lists the supported keys), `INVALID_PAGE`,
`INVALID_PAGE_SIZE`, `INVALID_FILTER` and `RETURN_BEFORE_OUTBOUND`. A malformed query
(`search.dto.ts`) is a `VALIDATION_ERROR` 400 that lists each bad field (NFR-SEC-03).

### What Search uses from other modules

| Module    | Call                       | When                                                     |
| --------- | -------------------------- | -------------------------------------------------------- |
| Catalog   | `getAirports(codes)`       | once per search: both airports exist, origin's time zone |
| Catalog   | `findFlights(route, date)` | once per search: the route's flights on that local day   |
| Catalog   | `isBookable(flight, now)`  | pure, per flight                                         |
| Catalog   | `priceParty(…)`            | pure, per flight: the same price Booking charges         |
| Inventory | `checkAvailability(batch)` | once per search, one request per bookable flight         |

## The pipeline

`SearchOneWay.execute` runs the same steps in this order (pack section 3.1). Each step is a small
function of its own:

1. **Validate.** `checkCriteria` checks everything that needs no data: same airport, real date,
   1 to 9 seated passengers with no more infants than adults, filter values, a registered sort key
   and the paging. A bad request makes no query. Then one `getAirports` read checks that both
   airports exist and that the date is not before today **on the origin airport's clock**. Today
   itself is accepted (NFR-DATA-02).
2. **Candidates.** `catalog.findFlights`: one route, one local day.
3. **Bookable.** `catalog.isBookable` (SCHEDULED or DELAYED, more than 2 h out). Pure.
4. **Seats.** **One** batched `inventory.checkAvailability` with every bookable flight and the
   full party; Inventory knows infants take no seat. A flight stays only if its inventory exists
   and can accommodate the party: seats left equal to seats needed is included.
5. **Price.** `catalog.priceParty`. A flight that cannot be priced (`NO_FARE`) is dropped. The
   result mapper copies the quote's total and breakdown and never recomputes them (US-FS-04).
6. **Filter.** `buildFilter(filters)`.
7. **Sort.** The chosen strategy, with the shared tie-break.
8. **Page.** `paginate`: default 20, capped at 50, below 1 rejected.

Filter and sort run before paging, so `total` is the filtered count, and the deterministic
tie-break means consecutive pages have no duplicates and no gaps (US-FS-05 AC-2).

Whatever the number of flights, a search makes **three reads**: one airport lookup (a small
primary-key read by code), one `findFlights` and one `checkAvailability` (NFR-PERF-01). A round
trip runs this pipeline once per leg, in parallel.

## Design patterns

### Strategy: sort orders (US-FS-02)

| Lecture role        | Here                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| «Strategy»          | `sorting/sort-strategy.ts`: `SortStrategy { key; compare(a, b) }`                                   |
| «Concrete Strategy» | `PriceSortStrategy`, `DurationSortStrategy`, `DepartureTimeSortStrategy`, `ArrivalTimeSortStrategy` |
| Context             | `SearchOneWay`, which holds the strategy the registry returned and only calls `compare`             |
| Lookup              | `sorting/sort-registry.ts`: `get(key)` (undefined when unknown) and `keys()`                        |

Each strategy compares by its own criterion, then by the shared `tieBreak` (departure instant,
then flight number), which is written once in `sort-strategy.ts`.

Why it fits:

- **Open/Closed.** The strategies are registered in `search.module.ts` under `SORT_STRATEGIES`.
  Adding "sort by stops" (US-FS-08) means one new class and one line in that provider. The use
  case, the registry and the error message stay the same: the 400 for an unknown key lists
  `registry.keys()`, so it updates by itself.
- **Single responsibility and testability.** Each strategy is a few lines with its own tests,
  including the pack's tie case (`BA155, MS777, MS779`) and a property test that no sort changes
  the set of results.
- **Rejected alternative:** a `switch (sortKey)` inside the use case. Every new sort would edit a
  method that also validates, checks availability and pages, and the hard-coded list of keys tends
  to be copied into the frontend.

### Filters as composable predicates (US-FS-03)

`filtering/filters.ts` is the declarative part of the module. `maxTotal`, `departsBetween`
(local window, inclusive) and `operatedBy` each return a `Predicate`. `buildFilter` AND's the
active ones with `every`, and the airline filter OR's its codes with `some`. They are pure: no
loops over flights and no order.

### Facade

`SearchFacade implements SearchApi` is the module's one entry point, the same way
`InventoryFacade` fronts Inventory. Callers see only the interface. The use cases, strategies,
registry and mapper are not exported (Interface Segregation).

## Inside the module

- `search-api.ts`: the public interface, token and types.
- `criteria-validator.ts`, `filtering/filters.ts`, `sorting/`, `paginate.ts`, `result-mapper.ts`:
  one pipeline step each.
- `search-one-way.ts`, `search-round-trip.ts`: the use cases, the imperative part.
- `search.facade.ts`, `search.controller.ts`, `search.dto.ts`: the boundary and the HTTP edge.
- `test-support.ts`: hand-written `CatalogApi` and `InventoryApi` stubs and a fixed clock for
  unit tests.

## Tests

- Unit (`*.spec.ts` here): validation BVA, each strategy, filters (EP and a decision table),
  paging BVA, the pipeline over stubs, including "each read happens exactly once", round trips and
  the controller's error mapping.
- Integration (`apps/api/test/search.int-spec.ts`): real Catalog and Inventory on PostgreSQL. It
  covers the after-midnight local day, direction and day, the capacity boundary including an
  active hold, malformed and oversized queries, and the round-trip route.
- E2E (`apps/web/e2e/search.spec.ts`): the search page in Chromium, Firefox and at 375 px.

### Benchmark (NFR-PERF-01)

`apps/api/test/search.bench.int-spec.ts` seeds 100 airports and 10,000 flights into a
Testcontainers PostgreSQL. It then times 200 random searches over HTTP and asserts p95 ≤ 500 ms.
It is skipped unless `RUN_BENCHMARK` is set:

```sh
# bash
RUN_BENCHMARK=1 pnpm --filter api exec vitest run --config vitest.integration.config.mts test/search.bench.int-spec.ts
```

```powershell
# PowerShell
$env:RUN_BENCHMARK='1'; pnpm --filter api exec vitest run --config vitest.integration.config.mts test/search.bench.int-spec.ts
```

It prints p50, p95 and max. A local run gave p50 10 ms, p95 13 ms and max 38 ms.

## Left to other modules

- US-FS-04 AC-3 (a fare change between search and booking) belongs to Booking (US-BK-03).
- US-FS-06 AC-3 (one booking with two segments, held in one transaction) belongs to Booking.
- US-FS-07 (flexible dates) and US-FS-08 (connections) are Stretch.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

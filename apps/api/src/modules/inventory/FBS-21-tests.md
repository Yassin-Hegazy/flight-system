# FBS-21 — Genuine Availability: Lab 7 test cases and verification records

**Jira:** [FBS-21 — US-INV-01: Show genuine availability](https://momowalid73.atlassian.net/browse/FBS-21)  
**Original implementation:** [PR #3](https://github.com/Yassin-Hegazy/flight-system/pull/3)  
**Documentation prepared:** 12 November 2026  
**Scope:** The Inventory `checkAvailability()` Facade, unit tests, real PostgreSQL integration tests, database constraints, migration integrity, and module boundaries. This is **not** a completed Search → Booking HTTP integration report.

> **Evidence note:** This document was prepared by inspecting the actual test sources and Jira acceptance criteria on `feature/fbs-24-release-seats` (GitHub head `3d769a95b493132a891020cbd962456a68093d2a`). It describes assertions present in the repository. The historical execution totals below come from the FBS-21 PR and subsequent Codex reports; this documentation pass did **not** rerun Vitest or independently capture test logs. Do not present this document alone as a fresh passing CI run.

## 1. User story, contract and acceptance criteria

**US-INV-01:** As a traveler, I want search results to reflect real seat availability so that I don't pick a flight that can't take my party.

| Jira criterion | Required behavior                                                                                 | Evidence in repository                                                                                            | Assessment                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **AC-1**       | Available seats per flight/cabin equal capacity minus committed seats minus unexpired held seats. | `US-INV-01-T01`, `T02`, `T05`, `T06`, `T08`, `T10`–`T12`, `U05`; SQL repository aggregation.                      | **Covered at Inventory level.**                                                                     |
| **AC-2**       | Respect requested cabin and number of seat-taking passengers; infants do not take seats.          | `US-INV-01-T02`, `T03`, `T09`, `U02`, `U03`.                                                                      | **Covered at Inventory level.**                                                                     |
| **AC-3**       | An expired hold must not reduce availability before a cleanup job changes its persisted status.   | `US-INV-01-T04`, including exactly-at-expiry and ±1 ms boundaries.                                                | **Covered at Inventory level.**                                                                     |
| **AC-4**       | Search and Booking consume availability only through the Inventory Facade.                        | `US-INV-01-T01`, `T07`, `T12`, `T20`; separate Nest `ConsumerModule`; `.dependency-cruiser.cjs` public-API rules. | **Inventory boundary verified; real Search/Booking consumption remains an integration dependency.** |

**Public API:** `InventoryApi.checkAvailability(requests: readonly AvailabilityRequest[], tx?: Tx): Promise<Result<Availability[], AvailabilityError>>` injected through `INVENTORY_API`. Each request specifies a flight UUID, `ECONOMY` or `BUSINESS`, and passenger counts. The operation returns `availableSeats`, `requiredSeats`, `canAccommodate` and `inventoryFound`, preserving input order and duplicates. Adults and children need seats; lap infants do not.

**Availability rule:** `availableSeats = max(0, capacity - committedSeats - SUM(seats WHERE status = 'HELD' AND expiresAt > currentTime))` per `(flightId, cabin)`. No database row means zero available seats and `inventoryFound: false`; this differs from an existing zero-capacity cabin.

## 2. Exact automated sources and shared setup

| Source                       | Location                                                                                                                               |                                                                        Cases represented |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------: |
| Unit tests                   | [`apps/api/src/modules/inventory/inventory.service.spec.ts`](inventory.service.spec.ts)                                                | **21** (five test definitions, including 17 parameterized invalid-input cases under U03) |
| PostgreSQL integration tests | [`apps/api/test/inventory.int-spec.ts`](../../../test/inventory.int-spec.ts)                                                           |               **28** (21 named T01–T21 groups; T09 runs six variants and T10 runs three) |
| Implementation               | `inventory.service.ts`, `inventory.facade.ts`, `inventory.repository.ts`, `pg-inventory.repository.ts`, `inventory-api.ts`, `index.ts` |                                                   Facade → Service → Repository contract |
| Schema                       | `1794355200000-CreateInventory.ts`, `1794441600000-AddInventoryFlightForeignKey.ts`                                                    |                                                          Real migrations and constraints |
| Architecture check           | `.dependency-cruiser.cjs`                                                                                                              |                                                                  Module-public-API rules |

**Unit fixture:** Flight UUID `00000000-0000-4000-8000-00000000000a`; fixed clock `2026-11-11T12:00:00Z`; mocked availability row in Economy with five available seats. Unit tests assert input validation, batching, a single timestamp, output mapping and early exits.

**PostgreSQL fixture:** Disposable `postgres:18-alpine` Testcontainers database, NestJS testing module, real TypeORM migrations, and valid Catalog flights `MS921` / `MS922` on `CAI → LHR` dated `2027-12-10`. The injected clock starts at `2026-11-11T12:00:00Z`. Before each case, disposable `seat_holds` / `cabin_inventory` rows are cleared and test flights recreated. Unless overridden, test Economy capacity is **10**, committed seats **3**, and a newly inserted hold occupies **2** seats. The test suite **does not truncate the persistent developer database**.

**Interpretation of results:** The **Expected** fields below are specification-derived; **Asserted/observed in source** means the code contains that concrete assertion. The last reported suites passed, but the documentation author did not re-execute them. Parameterized variants count as individual cases in Vitest.

## 3. Required Jira verification cases and traceability

Jira gives four _verification ideas_, not a mandated implementation filename or an exact test-runner classification. In particular, the repository's `T01` performs the arithmetic through **real PostgreSQL**, which is stronger than the suggested unit-only scenario; the unit coverage also exercises availability mapping.

| Jira verification idea                                                | Actual tests                                                          | Technique                                                 | Status / qualification                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **US-INV-01-T01:** capacity 10, committed 3, active hold 2 → 5        | `inventory.int-spec.ts` T01; `inventory.service.spec.ts` U02/U05      | Equivalence partitioning (EP), arithmetic, DB integration | Asserted exactly **5** through the public Facade.                                                                                                          |
| **US-INV-01-T02:** Economy vs Business; party with infant             | Integration T02/T03; unit U02/U03                                     | EP, cabin partition, passenger boundary                   | Cabins isolated; infants do not add to `requiredSeats`.                                                                                                    |
| **US-INV-01-T03:** past-due hold ignored                              | Integration T04                                                       | Boundary value analysis (BVA), state/time transition      | Past, exactly-now, future and one-millisecond-forward cases; status remains `HELD`.                                                                        |
| **US-INV-01-T04:** architectural rule rejects a private-module import | `.dependency-cruiser.cjs`; integration T01/T20; root `pnpm depcruise` | Architecture / contract verification                      | Public injection and rule configuration inspected; **no recorded intentional invalid-import negative-control run**. Search/Booking integration is pending. |

### US-INV-01-T01 — Genuine available-seat arithmetic

| Field                  | Record                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **User story / AC**    | US-INV-01 / AC-1 and AC-4                                                                                                   |
| **Test ID / source**   | `US-INV-01-T01`, `apps/api/test/inventory.int-spec.ts`                                                                      |
| **Preconditions**      | Valid Catalog flight, Economy inventory with capacity 10 and committed seats 3.                                             |
| **Test data**          | Two active `HELD` rows, one seat each, expiring in the future; request one adult.                                           |
| **Steps**              | Populate the disposable PostgreSQL tables; inject `INVENTORY_API` through a separate Nest module; call `checkAvailability`. |
| **Expected**           | `10 - 3 - (1 + 1) = 5`; `requiredSeats: 1`, `canAccommodate: true`, `inventoryFound: true`.                                 |
| **Asserted in source** | Full result equality with `availableSeats: 5` and public Facade identity.                                                   |
| **Technique**          | EP, arithmetic, real-DB integration and public-contract verification.                                                       |

### US-INV-01-T02 — Cabin and flight isolation

| Field                   | Record                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **User story / AC**     | US-INV-01 / AC-1, AC-2, AC-4                                                                                              |
| **Test ID / source**    | `US-INV-01-T02`, `apps/api/test/inventory.int-spec.ts`                                                                    |
| **Preconditions**       | Flight A: Economy 10/committed 3 and Business 4/committed 1; flight B: Economy 20/committed 0.                            |
| **Test data**           | Active holds of 2 Economy seats on A, 1 Business seat on A, and 4 Economy seats on B.                                     |
| **Steps**               | Submit one batch with B Economy, A Business, A Economy, and repeated A Economy.                                           |
| **Expected / asserted** | `availableSeats` equals `[16, 2, 5, 5]`, in request order; database manager executes the availability aggregate **once**. |
| **Technique**           | EP across flights/cabins, duplicate-input behavior and query batching.                                                    |

### US-INV-01-T03 — Passenger mix and infant partition

| Field                   | Record                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **User story / AC**     | US-INV-01 / AC-2                                                                                                                        |
| **Test ID / source**    | `US-INV-01-T03`, `apps/api/test/inventory.int-spec.ts`                                                                                  |
| **Preconditions**       | Flight Economy capacity 10, committed 3, active HELD 2 → 5 available.                                                                   |
| **Test data**           | One adult; three adults + two children + three infants; four adults + two children.                                                     |
| **Expected / asserted** | Tuples `(requiredSeats, availableSeats, canAccommodate)` equal `(1,5,true)`, `(5,5,true)`, `(6,5,false)`; lap infants consume no seats. |
| **Technique**           | EP and exact-capacity / one-over BVA.                                                                                                   |

### US-INV-01-T04 — Expiry boundary before cleanup

| Field                   | Record                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **User story / AC**     | US-INV-01 / AC-3                                                                                                                   |
| **Test ID / source**    | `US-INV-01-T04`, `apps/api/test/inventory.int-spec.ts`                                                                             |
| **Preconditions**       | Economy capacity 10, committed 3. The clock starts at `NOW`.                                                                       |
| **Test data**           | Three `HELD` rows: two seats expiring at `NOW−1 ms`, two at `NOW`, and one at `NOW+1 ms`.                                          |
| **Steps**               | Query at `NOW`, then advance the injected clock by 1 ms and query again; inspect persisted statuses.                               |
| **Expected / asserted** | Availability **6** at `NOW` (only the future one-seat hold counts), then **7** at `NOW+1 ms`; all three statuses are still `HELD`. |
| **Technique**           | BVA (`<`, `=`, `>` expiry) and time-driven state transition without cleanup.                                                       |

## 4. Additional PostgreSQL test records

All IDs below are in `apps/api/test/inventory.int-spec.ts`. Each row describes the code's exact key assertion, rather than inventing an external manual execution.

| ID      | AC             | Preconditions / action                                                                                                               | Expected and asserted behavior                                                                                                                                                                 | Technique                                         |
| ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **T05** | AC-1           | Insert holds in `COMMITTED`, `RELEASED`, `EXPIRED` states; committed count remains 3 in the fixture.                                 | No terminal-state hold contributes to active-held sum; availability **7**.                                                                                                                     | State partitioning                                |
| **T06** | AC-1           | Insert two active HELD rows each containing `2,147,483,647` seats against capacity 10.                                               | Available seats clamp to **0**, `canAccommodate: false`; large aggregate must not overflow integer conversion.                                                                                 | BVA / numeric robustness                          |
| **T07** | AC-4           | Supply an empty request batch.                                                                                                       | Returns `[]` and executes **zero** database queries.                                                                                                                                           | Empty partition / performance                     |
| **T08** | AC-1/4         | Provision Economy at **zero** capacity; leave Business and a second flight unprovisioned.                                            | All three requests fail accommodation with `availableSeats: 0`; provisioned Economy has `inventoryFound: true`; missing rows have `false`.                                                     | Zero/missing EP                                   |
| **T09** | AC-2/4         | Six malformed variants: unsupported cabin; negative adults; fractional children; no seat-taking party; excess infants; invalid UUID. | Corresponding typed `INVALID_CABIN`, `INVALID_PARTY`, `TOO_MANY_INFANTS`, or `INVALID_FLIGHT_ID`; **no** aggregate database query.                                                             | Invalid EP; **6 cases**                           |
| **T10** | AC-1           | Attempt invalid inventory rows: capacity −1/committed 0; capacity 10/committed −1; capacity 10/committed 11.                         | PostgreSQL CHECK rejects each with SQLSTATE **23514**.                                                                                                                                         | BVA / DB constraints; **3 cases**                 |
| **T11** | AC-1           | Duplicate cabin; seats 0/negative; unknown hold status; hold missing parent cabin; unsupported cabin enum.                           | PostgreSQL rejects with expected **23505**, **23514**, **22P02**, or **23503** codes.                                                                                                          | Schema constraints / negative EP                  |
| **T12** | AC-1/4         | Insert two-seat hold in an uncommitted caller transaction, query inside and outside, then roll back.                                 | Inside sees availability **5**, outside sees **7**; after rollback still **7**.                                                                                                                | Transaction visibility / rollback                 |
| **T13** | AC-1           | Examine migration-owned flight foreign key and TypeORM schema diff.                                                                  | FK is validated, nondeferrable, `ON DELETE RESTRICT`; the known schema-builder diff is only the FK drop (metadata limitation).                                                                 | Migration parity                                  |
| **T14** | AC-1           | Roll back foreign-key migration then base Inventory migration; reapply both.                                                         | Inventory tables disappear but Catalog `flights` survives; both migrations reapply; checked availability **7** afterward.                                                                      | Migration reversibility                           |
| **T15** | AC-1/2         | Provision a real Catalog flight with both Economy and Business rows.                                                                 | Facade reports available **7** and **4** respectively.                                                                                                                                         | Cross-schema validity / cabin EP                  |
| **T16** | AC-1           | Try provisioning inventory for nonexistent flight UUID.                                                                              | FK violation **23503** at `cabin_inventory_flight_fk`; no orphan inventory row.                                                                                                                | Referential integrity                             |
| **T17** | AC-1           | Attempt deleting a flight referenced by Inventory.                                                                                   | FK restrict violation **23001**, preserving both flight and inventory.                                                                                                                         | Referential integrity / negative state transition |
| **T18** | AC-1           | Roll back and reapply only the FK migration with Inventory rows, holds, Catalog flights and indexes present.                         | Data, other constraints and indexes unchanged; availability remains **5**.                                                                                                                     | Migration data preservation                       |
| **T19** | AC-1           | Remove FK, create intentionally orphaned inventory, attempt reapplying FK migration.                                                 | Migration raises explicit **23503** and hint; existing data unchanged, migration not recorded; fixture cleans its orphan then restores FK.                                                     | Failure atomicity / migration safety              |
| **T20** | AC-4 (partial) | Create Catalog flight through `CATALOG_API`; provision Inventory; query Facade and HTTP Catalog endpoints.                           | `checkAvailability` reports **7**; `GET /flights/:id`, `GET /flights`, `GET /health` succeed; Swagger includes `/flights/{id}`. **This is not an HTTP Inventory/Search/Booking booking flow.** | Nest DI / HTTP smoke, boundaries                  |
| **T21** | AC-1           | Attempt changing existing inventory flight ID or referenced Catalog flight ID to missing UUID.                                       | FK violation **23503**; original inventory and availability remain intact.                                                                                                                     | Referential integrity / update rejection          |

**Case-count reconciliation:** T01–T21 are 21 named `it()`/`it.each()` groups. T09 is a 6-case parameterized group (five additional cases) and T10 is a 3-case parameterized group (two additional cases): **21 + 5 + 2 = 28 PostgreSQL cases**.

## 5. Unit test records

All unit cases live in `apps/api/src/modules/inventory/inventory.service.spec.ts` and use a mocked repository and fixed clock.

| ID                | AC     | Preconditions / inputs                                                                                                                                                                                                        | Expected and asserted behavior                                                                                                                                   | Technique                              |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **US-INV-01-U01** | AC-4   | Empty request batch.                                                                                                                                                                                                          | `ok([])` without repository or clock access.                                                                                                                     | Empty partition                        |
| **US-INV-01-U02** | AC-2/4 | Four mixed requests: normalized uppercase flight UUID, five seat-taking passengers plus infants, six seat-taking passengers, and unprovisioned Business cabin.                                                                | A single deduplicated flight-ID query and single clock value; required seats `[1,5,6,...]`, accommodation `[true,true,false,false]`; Business missing inventory. | EP, boundary, batching                 |
| **US-INV-01-U03** | AC-2/4 | **17** invalid variations: null entry; invalid flight UUID; unsupported/null cabin; missing, empty, zero, negative, fractional, string, NaN, Infinity or overflow passenger counts; invalid children/infants; excess infants. | Typed failures before `findAvailability` runs; one bad item rejects the entire batch.                                                                            | Invalid EP / numeric BVA; **17 cases** |
| **US-INV-01-U04** | AC-4   | Non-array input at runtime.                                                                                                                                                                                                   | `INVALID_REQUEST` with no repository call.                                                                                                                       | Invalid container partition            |
| **US-INV-01-U05** | AC-1   | Repository simulates an inconsistent snapshot with −3 available.                                                                                                                                                              | Public service clamps to 0 and returns `canAccommodate: false`.                                                                                                  | Negative boundary / fail-safe mapping  |

**Unit-count reconciliation:** U01 (1) + U02 (1) + U03 (17) + U04 (1) + U05 (1) = **21 unit cases**.

## 6. Test-design methods (Lab 7)

| Technique                         | Classes / boundaries                                                                                                                                                                      | Evidence                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Equivalence partitioning (EP)** | Valid Economy vs Business; existing vs absent cabin; active HELD vs terminal status; normal party vs invalid party; valid vs invalid flight ID.                                           | T02, T03, T05, T08, T09, U02, U03 |
| **Boundary value analysis (BVA)** | Required seats exactly available (5) versus one above (6); hold expiry just before, at, just after NOW; zero and negative capacity; committed just above capacity; integer overflow sums. | T03, T04, T06, T10, U03, U05      |
| **State-transition testing**      | HELD future → HELD expired by clock movement without status cleanup; COMMITTED/RELEASED/EXPIRED held rows excluded from hold sum.                                                         | T04, T05                          |
| **Database integrity**            | CHECK, PK, enum, composite FK, Catalog flight FK, migration up/down and failure atomicity.                                                                                                | T10, T11, T13–T19, T21            |
| **Transactional integration**     | Caller-supplied transaction reads uncommitted writes; rollback restores availability.                                                                                                     | T12                               |
| **API / boundary testing**        | Facade injected through `INVENTORY_API`, empty batch, batched SQL, public-only dependency rules and Catalog HTTP smoke.                                                                   | T01, T02, T07, T20, U01–U04       |

## 7. TDD provenance and executed verification — evidence boundaries

### Historical FBS-21 implementation record

[PR #3](https://github.com/Yassin-Hegazy/flight-system/pull/3) states that Codex reported **118 unit tests** and **69 integration tests** passing at the time of the original FBS-21 work, with **42 Inventory-specific tests**. It also reports passing TypeScript, ESLint, Dependency Cruiser and build checks. These figures are **historical PR claims**, not a new independent execution.

The current later branch contains **21 FBS-21 unit cases and 28 FBS-21 PostgreSQL cases** (49 total), including additions associated with later migration and cross-module checks. Do not confuse these 49 current cases with the original PR's 42.

### Latest reported regressions and build

- The FBS-24 completion report from 12 November 2026 reports **227 passing unit tests**, **226 passing PostgreSQL integration tests**, and **20/20 repetitions** of the FBS-22 overselling stress case across the later Inventory branch. These are whole-suite totals, **not** 227/226 FBS-21-specific tests.
- The user subsequently ran `pnpm build` successfully: the web app and API both built after setting `API_URL=http://localhost:3001` for the local shell. That fixes the **observed missing-environment-variable build failure**; it does not constitute a dependency vulnerability scan.
- This documentation creation did **not** execute tests or inspect new CI job logs. For formal FBS-69 evidence, archive the exact command output and passing CI run URL after upstream PRs are merged.

### RED → GREEN → REFACTOR honesty

Tests and the architecture reflect TDD-style coverage, but the available PR description and reviewed source do **not** establish the exact historical RED command outputs, initial failing assertions, dates, or refactor sequence for FBS-21. **Do not invent RED/GREEN timestamps or screenshots.** Preserve a genuine test-first commit/log if located later; otherwise record historical TDD evidence as **not independently recoverable** and use current regression execution as reproducible verification, not retroactive proof of a RED stage.

### Reproduction commands (not executed during this documentation pass)

Run from the repository root on the branch containing FBS-21 and later Inventory changes:

```powershell
# Focused FBS-21 unit tests
pnpm --filter api exec vitest run src/modules/inventory/inventory.service.spec.ts

# Focused real-PostgreSQL tests; Docker/Testcontainers must be available
pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory.int-spec.ts

# Full repository gates
pnpm typecheck
pnpm lint
pnpm depcruise
pnpm test
pnpm test:integration
$env:API_URL = 'http://localhost:3001'
pnpm build
```

Use only the disposable test database provided by the test suite; **never truncate or reset the persistent development database**. A shell-level `API_URL` setting does not belong in a committed credential file.

## 8. FBS-69 handoff and remaining verification

| Item                   | Current evidence                                                                    | Remaining action / qualification                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FBS-21 AC-1            | T01, T02, T05, T06, T08, T10–T19, T21; U05.                                         | Capture fresh passing logs and CI.                                                                                                                       |
| FBS-21 AC-2            | T02, T03, T09; U02, U03.                                                            | No additional Inventory arithmetic code identified.                                                                                                      |
| FBS-21 AC-3            | T04.                                                                                | Cleanup scheduling belongs to later expiry integration; availability behavior works without cleanup.                                                     |
| FBS-21 AC-4            | Public Facade injection, T01/T20, `.dependency-cruiser.cjs`.                        | **Verify actual Search and Booking consumers and (if required) intentional private-import rejection test** once integrations are present.                |
| NFR-MAINT-01           | Rule `module-public-api-only` and `outside-code-uses-module-index-only` configured. | Save successful `pnpm depcruise` output and, if required by instructor, demonstrate a temporary negative-control violation safely without committing it. |
| PostgreSQL consistency | Real constraints, migrations, transaction rollback and FK integrity tested.         | Include latest CI and test run evidence for FBS-69.                                                                                                      |
| Original PR delivery   | PR #3 remains independently reviewable.                                             | At documentation time PR #3 was still **open**; Jira completion requires approved/merged predecessor PRs. Verify live status before claiming Done.       |
| Cross-module E2E       | Catalog HTTP smoke only.                                                            | Search/Booking actual availability consumers must be integrated and tested by responsible module owners; do not claim already done.                      |
| RED-stage proof        | Historical output not found in consulted sources.                                   | Link genuine historical evidence if later recovered; do not fabricate.                                                                                   |

**Assessment:** FBS-21 has substantial **source-level unit and real PostgreSQL test coverage** for its three behavioral acceptance criteria. The fourth criterion is **partially verified** through Facade injection and static architecture policy, pending real Search/Booking consumption. This document fills the missing Markdown documentation, **not** the remaining integration and delivery gates.

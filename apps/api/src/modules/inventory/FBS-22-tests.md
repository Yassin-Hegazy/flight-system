# FBS-22 — Lab 7 test cases and execution evidence

**User story:** US-INV-02 — Prevent Overselling. **Execution date:** 2026-11-12.
**Scope:** Inventory's public Facade and caller-supplied transactions; not an end-to-end Booking API.

Environment: Node.js 24.22.1, pnpm 12.10.1, Vitest 5.0.3, TypeORM 1.1.1, and the existing
`postgres:18-alpine` Testcontainers helper. All migrations, including the FBS-21 flight foreign
key, run on disposable databases. No persistent development data is changed.

Automated sources:

- [Unit tests](inventory-hold.spec.ts): 36 FBS-22 cases.
- [PostgreSQL tests](../../../test/inventory-hold.int-spec.ts): 48 FBS-22 cases, including 20 stress repetitions.
- FBS-21 regression: 21 unit cases and 28 PostgreSQL cases remain passing.

## Common test setup and interpretation

For every PostgreSQL case, the suite clears its own disposable Inventory/hold fixtures and creates
two valid Catalog flights using migration-seeded airline MS and airports CAI/LHR. Flight A has
Economy capacity 10 and Business capacity 4; flight B has Economy capacity 10. Committed seats
start at zero and no holds exist, except where a case explicitly changes these values. The
injected clock starts at `2026-11-12T12:00:00Z`. UUIDs A and B sort in that order.

Unless specified otherwise, requests have a fresh booking UUID, flight A, Economy, one seat and
the default 900-second duration. Calls use `INVENTORY_API` injected into a separate Nest consumer
module; no private Inventory entities/repositories are imported by integration tests.

For parameterized cases, each listed input/repetition is a separate automated case. Story is
US-INV-02 for every record below. Supplemental records inherit this story and common setup;
their Preconditions column lists differences. All Actual Result and Status fields below refer
to executed tests, not predictions. A passing result establishes Inventory-level behavior only.

## Required acceptance cases

### US-INV-02-T01

| Field                | Record                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Test Case ID         | US-INV-02-T01                                                                                                                   |
| User Story           | US-INV-02                                                                                                                       |
| Acceptance Criterion | AC-1                                                                                                                            |
| Title                | Availability changes after Search                                                                                               |
| Preconditions        | Valid Catalog flight A; Economy capacity 1, committed 0; no holds                                                               |
| Test Data            | Two different booking UUIDs, one requested seat each                                                                            |
| Steps                | Read availability; reserve one seat and commit in another transaction; attempt a second reservation using the same flight/cabin |
| Expected Result      | Initial availability 1; first hold succeeds; second returns `SEATS_UNAVAILABLE`                                                 |
| Actual Result        | Observed 1 initially, first success, typed second conflict, and final availability 0                                            |
| Postconditions       | Exactly one active hold for one seat; no overselling                                                                            |
| Status               | Pass                                                                                                                            |
| Testing Technique    | EP, state transition, transactional integration                                                                                 |

### US-INV-02-T02

| Field                | Record                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Test Case ID         | US-INV-02-T02                                                                                                                        |
| User Story           | US-INV-02                                                                                                                            |
| Acceptance Criterion | AC-2                                                                                                                                 |
| Title                | PostgreSQL enforces committed-seat bounds                                                                                            |
| Preconditions        | Valid Catalog flight and Economy capacity 10                                                                                         |
| Test Data            | Committed seats 0, 10, 11                                                                                                            |
| Steps                | Update committed seats directly through SQL to 0, then 10, then 11; inspect availability; restore 0                                  |
| Expected Result      | 0 and 10 accepted; 11 rejected by `cabin_inventory_committed_valid`, SQLSTATE `23514`                                                |
| Actual Result        | Both boundaries accepted; 11 rejected by the named CHECK; availability stayed 0 after rejection and returned to 10 after restoring 0 |
| Postconditions       | No invalid committed count persisted                                                                                                 |
| Status               | Pass                                                                                                                                 |
| Testing Technique    | BVA, database constraint testing independent of application validation                                                               |

### US-INV-02-T03

| Field                | Record                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test Case ID         | US-INV-02-T03                                                                                                                                      |
| User Story           | US-INV-02                                                                                                                                          |
| Acceptance Criterion | AC-3                                                                                                                                               |
| Title                | Two independent transactions compete for the last seat                                                                                             |
| Preconditions        | Economy capacity 1; two real connections with distinct PostgreSQL backend PIDs; both transactions already started at READ COMMITTED                |
| Test Data            | One seat per request, distinct booking UUIDs                                                                                                       |
| Steps                | Open a common start barrier; call the Facade from both transactions; commit success and roll back business failure; inspect holds and availability |
| Expected Result      | Exactly one success, one `SEATS_UNAVAILABLE`, one active seat, zero unexpected errors                                                              |
| Actual Result        | All expected counts and typed outcomes observed; no rejected transaction promises                                                                  |
| Postconditions       | One persisted active hold; available seats 0                                                                                                       |
| Status               | Pass                                                                                                                                               |
| Testing Technique    | Real database concurrency, synchronized start, EP                                                                                                  |

### US-INV-02-T04

| Field                | Record                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Test Case ID         | US-INV-02-T04                                                                                                                    |
| User Story           | US-INV-02                                                                                                                        |
| Acceptance Criterion | AC-4                                                                                                                             |
| Title                | Caller failure rolls back a successful hold                                                                                      |
| Preconditions        | Economy capacity 10, committed seats 3; no holds                                                                                 |
| Test Data            | Request 2 seats; injected exception after successful hold insertion                                                              |
| Steps                | Start transaction; call hold; read availability inside and outside the transaction; throw before commit; inspect persisted state |
| Expected Result      | Inside sees 5, outside sees 7; rollback leaves no hold; committed remains 3 and available remains 7                              |
| Actual Result        | All values matched; injected error propagated and `seat_holds` was empty afterwards                                              |
| Postconditions       | No partial Inventory state or orphan hold                                                                                        |
| Status               | Pass                                                                                                                             |
| Testing Technique    | Fault injection, isolation, rollback integration                                                                                 |

## Supplemental PostgreSQL case records

All rows inherit **User Story: US-INV-02** and common setup above. The title is the behavior column.

| Test Case ID  | AC     | Title / behavior                                    | Preconditions                                                | Test Data                                                                                                          | Steps                                                                                                                            | Expected Result                                                      | Actual Result                                                                        | Postconditions                                              | Status | Testing Technique                      |
| ------------- | ------ | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------ | -------------------------------------- |
| T05 (3 cases) | AC-1   | Seat-count boundaries                               | A/Economy capacity 3                                         | Seats 2, 3, 4                                                                                                      | Reserve each in a separate fresh case                                                                                            | 2/3 succeed; 4 conflicts                                             | Matched all three; availability 1/0/3                                                | One hold of 2/3 or no hold                                  | Pass   | BVA, EP                                |
| T06           | AC-1   | Committed and active holds only                     | Capacity 10, committed 2                                     | Active HELD 3; HELD 7 expired; HELD 7 exactly now; RELEASED/COMMITTED/EXPIRED 7 each with future expiry; request 5 | Seed status/time partitions; reserve 5                                                                                           | Only active HELD reduces availability                                | Success; two active holds total 8 seats; available 0                                 | Inactive rows unchanged; no double counting committed holds | Pass   | EP, temporal boundary                  |
| T07           | AC-1   | Post-lock expiry clock                              | Capacity 1; two independent transactions                     | First hold lasts 1 second; second requests default duration                                                        | First holds without commit; start second; observe `pg_blocking_pids`; advance clock exactly 1 second; commit first; await second | Waiter samples new time and succeeds                                 | Server blocking observed; waiter succeeded and expires at new time + 900 seconds     | Two persisted HELD rows, only one active                    | Pass   | Real lock contention, exact expiry BVA |
| T08 (2 cases) | AC-3   | Independent cabins/flights progress                 | An uncommitted Economy hold takes all 10 A seats             | A/Business and B/Economy requests; local lock timeout 1 second                                                     | Keep A/Economy locked; reserve independent target in another transaction                                                         | Independent request succeeds without waiting on A/Economy            | Both partitions passed; remaining seats 3 and 9                                      | Independent hold committed; blocker rolled back             | Pass   | Concurrency, EP                        |
| T09 (2 cases) | AC-1   | Missing Inventory fails closed                      | Missing flight or B/Business has no inventory row            | Unknown UUID; B/Business                                                                                           | Call hold in a transaction                                                                                                       | `INVENTORY_NOT_FOUND`                                                | Both typed failures observed                                                         | No hold inserted                                            | Pass   | EP                                     |
| T10 (8 cases) | AC-1   | Invalid requests have no writes                     | Common setup                                                 | Seats 0/-1/0.5/2147483648; duration 0/MAX_SAFE_INTEGER; malformed booking UUID; FIRST cabin                        | Submit each through Facade                                                                                                       | Corresponding typed validation failure                               | All expected error codes observed                                                    | Holds table remains empty                                   | Pass   | BVA, EP                                |
| T11           | AC-4   | Require a live caller transaction                   | Default manager or committed QueryRunner                     | Otherwise valid request                                                                                            | Call with each invalid manager state                                                                                             | Throw explicit active-transaction usage error                        | Both rejected before writing                                                         | No hold                                                     | Pass   | Transaction misuse partition           |
| T12 (2 cases) | AC-1   | Refuse stale-snapshot isolation modes               | Active REPEATABLE READ or SERIALIZABLE transaction           | Valid request                                                                                                      | Call hold at each unsupported isolation                                                                                          | Throw READ COMMITTED contract error                                  | Both rejected; errors not disguised as seat conflicts                                | No hold                                                     | Pass   | Isolation, EP                          |
| T13           | AC-4   | Roll back a previous hold on later business failure | B's 10 seats already held                                    | One booking requests A then B                                                                                      | Hold A; receive conflict on B; caller throws rollback signal                                                                     | Earlier A hold rolls back                                            | No hold for rejected booking; A has 10 seats, B has 0                                | Only original B hold remains                                | Pass   | Fault injection, caller atomicity      |
| T14           | AC-1   | Persist exact hold fields                           | Common setup                                                 | A/Business, seats 4, duration 60 seconds                                                                           | Reserve and inspect returned hold UUID/row                                                                                       | HELD row matches request and now + 60 seconds; committed unchanged   | All fields matched; Business available 0; Economy available 10                       | Committed seats remain 0                                    | Pass   | EP, persistence integration            |
| T15           | AC-3   | Stable multi-flight lock ordering                   | A/B each have one Economy seat; two independent transactions | Opposite supplied flight orders                                                                                    | Both consumers normalize to ascending UUID order; reserve sequentially in their own transaction                                  | One complete two-flight reservation, one typed conflict; no deadlock | Two holds belonging to one booking; both flights available 0; zero unexpected errors | Loser's transaction rolled back                             | Pass   | Concurrency, caller ordering contract  |
| T16           | AC-3/4 | Waiter succeeds after blocker rollback              | Capacity 1; two independent transactions                     | One-seat requests                                                                                                  | First inserts without commit; second blocks (observed on server); roll back first; commit waiter                                 | Only waiter persists                                                 | One active/persisted hold; no orphan from first transaction                          | No lost or oversold seat                                    | Pass   | Concurrency, rollback fault injection  |

## Unit case records

These use a mocked persistence interface to isolate validation and orchestration; PostgreSQL
correctness is covered above. All inherit **User Story: US-INV-02**. Default unit fixture has
3 available seats, a successful lock/insert, and the fixed common clock.

| Test Case ID   | AC     | Title / behavior                           | Preconditions                          | Test Data                                                                                                                                                                                                                  | Steps                                                                  | Expected Result                                             | Actual Result                                                           | Postconditions                           | Status | Testing Technique         |
| -------------- | ------ | ------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- | ------ | ------------------------- |
| U01            | AC-1   | Order and default duration                 | Default unit fixture                   | Valid one-seat request; same caller Tx                                                                                                                                                                                     | Invoke Facade; inspect ordering and arguments                          | Lock, clock, availability, insert; expiry +900 seconds      | Correct order, one clock sample, same Tx, returned hold ID              | No independent transaction               | Pass   | Interaction/contract test |
| U02 (25 cases) | AC-1   | Invalid inputs rejected before persistence | Default unit fixture                   | Null request; bad/null booking ID; bad flight ID; FIRST/null cabin; seats 0/-1/1.5/NaN/Infinity/string/null/undefined/INT_MAX+1/unsafe integer; duration 0/-1/0.5/NaN/Infinity/string/null/MAX_SAFE_INTEGER/unsafe integer | Invoke for each partition                                              | Specific validation error; no lock/read/insert/clock access | Every partition returned its expected code and made no persistence call | No side effects                          | Pass   | BVA, EP                   |
| U03 (3 cases)  | AC-1/3 | Available-seat boundaries                  | 3 available seats                      | Request 2, 3, 4                                                                                                                                                                                                            | Invoke for each                                                        | 2/3 succeed, 4 unavailable; only successes insert           | All outcomes and insert counts matched                                  | No insert on conflict                    | Pass   | BVA                       |
| U04            | AC-1   | Missing cabin                              | Repository reports lock target missing | Valid request                                                                                                                                                                                                              | Invoke                                                                 | `INVENTORY_NOT_FOUND`, no clock/insert                      | Matched                                                                 | No hold                                  | Pass   | EP                        |
| U05            | AC-1   | Normalize IDs and accept integer maximum   | Mock reports INT_MAX available         | Uppercase UUIDs, seats 2147483647, duration 1 second                                                                                                                                                                       | Invoke and inspect insert                                              | Lowercase IDs; correct count; expiry +1 second              | Matched                                                                 | Correct hold command                     | Pass   | BVA, normalization        |
| U06            | AC-1   | Reject expiration overflow                 | Clock is Date maximum minus 500 ms     | Duration 1 second                                                                                                                                                                                                          | Invoke after lock                                                      | `INVALID_HOLD_DURATION`, no insert                          | Matched                                                                 | No hold                                  | Pass   | Date boundary             |
| U07 (3 cases)  | AC-4   | Unexpected failures propagate              | Lock, availability, or insert rejects  | Same injected Error object                                                                                                                                                                                                 | Invoke at each failure point                                           | Original error propagates, not a business code              | Matched at all three points                                             | Caller can roll back                     | Pass   | Fault injection           |
| U08            | AC-1   | Await lock and snapshot input              | Lock promise unresolved                | Mutate request count/flight while waiting                                                                                                                                                                                  | Start call; verify no clock sample; mutate caller object; release lock | Original validated values used; clock sampled after release | Matched                                                                 | Caller mutation cannot redirect the hold | Pass   | Asynchronous interleaving |

## NFR-CONS-01 stress record

| Field                | Record                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test Case IDs        | NFR-CONS-01 repetitions 1–20                                                                                                                                                    |
| User Story           | US-INV-02                                                                                                                                                                       |
| Acceptance Criterion | AC-3; NFR-CONS-01                                                                                                                                                               |
| Title                | Fifty simultaneous reservations for ten seats                                                                                                                                   |
| Preconditions        | Fresh common fixture per repetition; 50 distinct server connections, all at READ COMMITTED before barrier release                                                               |
| Test Data            | Capacity 10; 50 distinct booking IDs requesting 1 seat each; default duration                                                                                                   |
| Steps                | Start all 50 transactions; verify unique backend PIDs and isolation; open barrier; await all outcomes/transaction cleanup; query active holds and availability; repeat 20 times |
| Expected Result      | Every repetition: 10 successes, 40 `SEATS_UNAVAILABLE`, 10 active seats, 0 available, no unexpected errors                                                                      |
| Actual Result        | Final full run: 20/20 repetitions passed; 1,000 attempts yielded 200 successes and 800 typed conflicts; zero overselling and zero unexpected transaction errors                 |
| Postconditions       | Each repetition ends with exactly 10 active holds; fixtures reset before the next repetition                                                                                    |
| Status               | Pass                                                                                                                                                                            |
| Testing Technique    | Concurrency stress, repetition, synchronized starts, isolated real databases                                                                                                    |

Final-run timings printed by the test (`elapsedMs`, connection setup/barrier/transactions/assertions
included; fixture reset and container startup excluded):

| Repetition | ms   | Repetition | ms  |
| ---------- | ---- | ---------- | --- |
| 1          | 1030 | 11         | 298 |
| 2          | 431  | 12         | 287 |
| 3          | 573  | 13         | 285 |
| 4          | 513  | 14         | 332 |
| 5          | 625  | 15         | 340 |
| 6          | 534  | 16         | 260 |
| 7          | 387  | 17         | 274 |
| 8          | 355  | 18         | 239 |
| 9          | 285  | 19         | 258 |
| 10         | 278  | 20         | 277 |

Range: 239–1030 ms for a whole 50-attempt round on this machine while other checks were running.
These are diagnostic harness timings, **not request p95** and **not NFR-PERF-02 evidence**.
NFR-PERF-02 requires a create-booking endpoint with p95 <= 1 second at 20 concurrent users; that
endpoint is not integrated, so this end-to-end measurement remains pending.

The earlier GREEN run also executed all 20 repetitions successfully. Thus 40 complete stress
repetitions (2,000 attempts) were executed during implementation; the detailed timing table above
is from the final 20-repetition run only.

## Executed RED → GREEN → REFACTOR sequence

Commands below run from the repository root. This Windows environment uses
`$env:SWC_NATIVE_BINDING_CACHE = Join-Path $env:USERPROFILE '.flight-system-swc-native'`, the
existing dedicated SWC native cache. Project checks also use `API_URL=http://localhost:3001`.
No dependencies, test configuration, database infrastructure, or quality gates were replaced.

1. **RED — before production changes.** Added the two new test files. Ran:
   - `pnpm --filter api exec vitest run src/modules/inventory/inventory-hold.spec.ts -t US-INV-02-U01`
     → 1 failed, 35 deselected. Failure: `TypeError: facade.hold is not a function`.
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-hold.int-spec.ts -t 'US-INV-02-T0[1-4]'`
     → T01/T03/T04 failed because `inventory.hold` did not exist; T02 passed against the existing
     database CHECK. Other cases were intentionally deselected by the explicit test-name filter.
2. **GREEN — minimum hold implementation.** Added the public operation, row lock, transaction
   guard, post-lock clock/read and insertion, reusing FBS-21's query and schema. Ran:
   - `pnpm --filter api exec vitest run src/modules/inventory` → 57 passed.
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-hold.int-spec.ts test/inventory.int-spec.ts`
     → 74 passed (46 then-current FBS-22 cases plus 28 FBS-21 cases), including all 20 stress rounds.
3. **REFACTOR.** Extracted pure request validation/normalization from the transactional service
   workflow, named the PostgreSQL integer limit, corrected test tuple/query typing, and made the
   concurrency test helper roll back typed failures. Added caller ordering and rollback-waiter
   regressions T15/T16. Ran:
   - Inventory unit command above → 57 passed.
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-hold.int-spec.ts -t 'US-INV-02-T(03|07|15|16)'`
     → all 4 selected real-concurrency cases passed; 44 intentionally deselected.
   - Fixed one lint finding in the test helper by explicitly treating rejected-promise reasons as
     `unknown`. Full checks below then passed without exclusions or disabled tests.

## Final repository verification

| Command / evidence                                                                  | Actual result                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                    | Pass, both apps                                                                                                           |
| `pnpm lint`                                                                         | Pass                                                                                                                      |
| `pnpm depcruise`                                                                    | Pass; 127 modules / 320 dependencies; no boundary violations                                                              |
| `pnpm test`                                                                         | 154 tests / 19 files passed; includes all 118 pre-existing unit cases                                                     |
| `pnpm test:integration --reporter=default --reporter=json --outputFile=$reportPath` | 124 tests / 8 files passed; includes all 76 pre-existing integration cases; duration 33.54 seconds                        |
| FBS-21 regression                                                                   | 21 unit + 28 integration cases passed, including migration-only FK parity, FK enforcement and migration rollback/reapply  |
| `pnpm build`                                                                        | Both apps passed on retry; first run stopped for the pre-existing Next.js advisory; no dependency changes or bypass flags |
| `git diff --check`                                                                  | Pass (final workspace review)                                                                                             |
| `git status`                                                                        | Only Inventory implementation, tests and documentation changed on `feature/fbs-22-overselling`; unstaged and uncommitted  |

The final integration JSON report was written to `$env:TEMP/fbs-22-integration-results.json`;
the durable observed results are recorded here. A pre-existing PostgreSQL client deprecation
warning occurred during schema inspection; it did not fail the integration suite.

The existing Playwright suite only covers home-page health/accessibility. It was inspected and
not run for this internal Facade change; there is no applicable Inventory/Booking browser flow.
The full backend HTTP integration suite did run and pass.

## M2 and remaining integration

Inventory's availability, hold creation, last-seat competition, stress outcomes and rollback can
be demonstrated through the integration suite and internal Facade. Existing health, Catalog and
Users/Access HTTP demonstrations remain available; normal application startup exposes `/docs`.
Search must integrate the availability read, and Booking must own the shared transaction, order
multi-flight locks, handle typed conflicts and expose an appropriate real HTTP workflow. No
demonstration-only endpoint, frontend or end-to-end booking demonstration was implemented.

For live data, apply existing migrations, use seeded airlines/airports, create valid Catalog
flights and provision both cabin inventories using their real UUIDs. Prepare representative
committed/active/expired holds with expirations relative to demonstration time. No new seed or
schema requirement is introduced by FBS-22. FBS-23 payment confirmation/hold lifecycle and FBS-24
release behavior remain separate stories. See the [README](README.md) for transaction-error,
lock-ordering, migration-generation and future writer contracts.

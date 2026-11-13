# FBS-23 — Extended Inventory test and verification records

Execution date: **2026-11-12**. Branch: `feature/fbs-23-payment-holds`, starting at `7d82bbb`.
The branch was already correct and clean. No branch switching, commits, pushes or Jira changes
were performed. This is local Inventory preparation; it does not resolve upstream merge blockers.

Sources: the owner's FBS-23 instructions, the existing verified code, and the live description of
[FBS-23](https://momowalid73.atlassian.net/browse/FBS-23), read without modification. The original
`03-inventory.pdf` was not available in the workspace. Its exact capacity/load TypeScript contracts
could not be checked; the compatible contracts below are explicitly documented decisions.

## Environment, fixtures and scope

Node 24.22.1, pnpm 12.10.1, Vitest 5.0.3, TypeORM 1.1.1, existing PostgreSQL 18 Testcontainers
infrastructure. Tests use a fixed injected clock, initially `2026-11-12T12:00:00Z`.

[PostgreSQL tests](../../../test/inventory-payment.int-spec.ts) contain **59 cases** (44 prior + 15 prepayment).
[Unit tests](inventory-payment.spec.ts) contain **39 cases** (23 prior + 16 prepayment). Integration tests import Inventory
only through `index.ts` and inject `INVENTORY_API` from a separate Nest consumer module.

Common integration preconditions: a newly migrated disposable database, seeded MS airline and
CAI/LHR airports, valid Catalog flights A and B. A has Economy capacity 10 and Business capacity 4;
B is unprovisioned. No holds or committed seats exist unless specified. Every test resets only
its suite's disposable database. Persistent local/demo flights, tables and volumes are untouched.
Default hold data: fresh booking UUID, A/Economy, two seats, default 900 seconds. All writes use a
caller-owned READ COMMITTED transaction. Lock tests use two distinct PostgreSQL backend PIDs,
observe actual blocking with `pg_blocking_pids`, and apply bounded local lock/statement timeouts.

All official cases below belong to **US-INV-03**. Parameterized inputs are separate automated cases.
Set-capacity and load records are additional Inventory scope, not extra US-INV-03 acceptance criteria.
Results establish behavior at Inventory's transaction boundary, not real payment/booking integration.

## 1. FBS-23 official acceptance tests

### US-INV-03-T01 — 15-minute expiration

| Field           | Record                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| User Story / AC | US-INV-03 / AC-1                                                                     |
| Purpose         | Verify the existing hold operation without replacing it                              |
| Preconditions   | Common fixture; deterministic clock; fresh booking UUID                              |
| Test Data       | A/Economy, two seats, omitted durationSeconds                                        |
| Steps           | Call hold inside caller transaction; commit; inspect bookingId, status and expiresAt |
| Expected        | HELD row belongs to booking and expires at clock + 900 seconds                       |
| Actual          | Persisted values matched, including exact UTC timestamp                              |
| Postconditions  | One held reservation; no committed seat increment                                    |
| Status          | Pass — Inventory side                                                                |
| Technique       | EP, persisted-state integration, deterministic clock                                 |

### US-INV-03-T02 — Held last seat unavailable

| Field           | Record                                                     |
| --------------- | ---------------------------------------------------------- |
| User Story / AC | US-INV-03 / AC-2                                           |
| Purpose         | Verify active held seats remain unavailable to competitors |
| Preconditions   | A/Economy capacity reduced to one; no commitments          |
| Test Data       | Distinct bookings requesting one seat each                 |
| Steps           | Create first hold; read availability; attempt second hold  |
| Expected        | Availability zero; second result SEATS_UNAVAILABLE         |
| Actual          | Both outcomes observed; existing hold unchanged            |
| Postconditions  | One reserved seat, no overselling                          |
| Status          | Pass — Inventory side                                      |
| Technique       | EP, state transition, existing reservation regression      |

### US-INV-03-T03 — Failure between Inventory commit and Booking confirmation

| Field           | Record                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| User Story / AC | US-INV-03 / AC-3                                                                                                           |
| Purpose         | Verify caller-controlled atomic rollback                                                                                   |
| Preconditions   | Default valid HELD row                                                                                                     |
| Test Data       | Two seats; injected exception after Inventory commitment                                                                   |
| Steps           | Start caller transaction; call commit successfully; throw before simulated confirmation completes; inspect persisted state |
| Expected        | Both committed count and hold status roll back                                                                             |
| Actual          | Hold remained HELD, committedSeats remained 0, availability remained 8                                                     |
| Postconditions  | No partial Inventory confirmation                                                                                          |
| Status          | Pass — fault injection at Inventory boundary; actual Booking.confirmPaid remains absent                                    |
| Technique       | Fault injection, transaction rollback, state transition                                                                    |

### US-INV-03-T04 — Expiry while payment is in progress

| Field           | Record                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| User Story / AC | US-INV-03 / AC-4                                                                                                                                      |
| Purpose         | Reject commitment arriving at expiry after a simulated payment delay                                                                                  |
| Preconditions   | Default valid HELD row; controllable payment promise                                                                                                  |
| Test Data       | Advance clock to exactly expiresAt before resolving promise                                                                                           |
| Steps           | Start simulated payment; advance clock; resolve; call commit in caller transaction                                                                    |
| Expected        | HOLD_EXPIRED; no committed increment or status transition                                                                                             |
| Actual          | HOLD_EXPIRED, HELD status, committedSeats 0, availability 10                                                                                          |
| Postconditions  | Expired reservation did not consume capacity or become committed                                                                                      |
| Status          | Pass for late-commit path; new prepayment cases below verify Inventory precharge rejection. Actual gateway invocation gating remains integration work |
| Technique       | Temporal BVA, simulated async delay, state transition                                                                                                 |

### Supplemental FBS-23 PostgreSQL records

All inherit US-INV-03 and common setup. Data/steps describe deviations from the common fixture.

| ID      | AC     | Purpose / preconditions / test data                                 | Steps                                                                                     | Expected result                                     | Actual result / postconditions                           | Status | Technique                         |
| ------- | ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- | ------ | --------------------------------- |
| T05 (3) | AC-3/4 | Expiration offsets -1, 0, +1 ms                                     | Advance fixed clock then commit                                                           | Only -1 ms succeeds                                 | Correct status/count for each boundary                   | Pass   | BVA                               |
| T06     | AC-3   | Duplicate commitment before/after original expiry                   | Commit twice; advance beyond expiry; retry                                                | NOT_HELD on both retries                            | Count exactly 2; committed row not counted again as held | Pass   | State transition, EP              |
| T07 (2) | AC-3/4 | RELEASED and EXPIRED stored statuses                                | Set fixture status; attempt commit                                                        | NOT_HELD / HOLD_EXPIRED respectively                | Both correct; no successful commitment                   | Pass   | EP, state transition              |
| T08 (2) | AC-3   | Malformed UUID and well-formed missing hold                         | Attempt commit                                                                            | INVALID_HOLD_ID / NOT_HELD                          | Both typed results observed                              | Pass   | EP                                |
| T09     | AC-3   | Two connections, same hold                                          | First commits Inventory without completing transaction; second waits; finish first        | First success, second NOT_HELD                      | Real blocking observed; committed count exactly 2        | Pass   | Concurrency, duplicate prevention |
| T10     | AC-4   | Hold expires while cabin lock is blocked                            | Lock cabin in first transaction; start commit in second; advance clock to expiry; release | HOLD_EXPIRED                                        | No status/count mutation; clock used after cabin wait    | Pass   | Lock wait, temporal BVA           |
| T11     | AC-2/3 | Full-capacity hold committed while competitor attempts another hold | Keep first transaction open; observe second blocked; commit first                         | Competitor SEATS_UNAVAILABLE, no deadlock           | Correct typed conflict, no unexpected error              | Pass   | Concurrency, writer lock order    |
| T12     | AC-3   | Temporary test trigger raises on hold status update                 | Attempt commit; remove test-only trigger/function in finally                              | Database error propagates; both mutations roll back | HELD / committed 0 after failure                         | Pass   | Database fault injection          |
| T13     | AC-3   | Valid missing hold ID with autocommit manager                       | Attempt commit outside transaction                                                        | Explicit caller-transaction error                   | Rejected before writes                                   | Pass   | Transaction contract              |
| T14     | AC-4   | Hold row lock itself is blocked                                     | Test deliberately holds only hold-row lock; advance clock while second waits              | HOLD_EXPIRED after second lock acquired             | No committed change                                      | Pass   | Second-lock temporal BVA          |
| T15     | AC-3   | First commitment rolls back while duplicate waits                   | Roll back first; commit waiter                                                            | Waiter succeeds once                                | Final COMMITTED, committedSeats 2                        | Pass   | Concurrency, rollback             |
| T16     | AC-3   | Invalid direct fixture holds 11 seats against capacity 10           | Attempt commit                                                                            | Named PostgreSQL capacity CHECK rejects             | SQLSTATE 23514; HELD / committed 0 preserved             | Pass   | Constraint, fault injection       |

### AC-4 prepayment eligibility contract (implemented)

The final improvement adds a read-only public operation:

```ts
validateForPayment(holdId: string, bookingId: string):
  Promise<Result<HoldPaymentEligibility, HoldValidationError>>;

interface HoldPaymentEligibility {
  readonly holdId: string;
  readonly bookingId: string;
  readonly expiresAt: Date;
}
type HoldValidationError = CommitError | 'INVALID_BOOKING_ID';
```

The required expected booking ID prevents accidental cross-booking validation. It is checked in
the same parameterized SELECT as the hold ID. Malformed inputs yield `INVALID_HOLD_ID` or
`INVALID_BOOKING_ID`. Unknown or mismatched holds yield `NOT_HELD`. Matching terminal and expired
states use the same rules as commit: COMMITTED/RELEASED => NOT_HELD; EXPIRED or HELD with
expiresAt <= now => HOLD_EXPIRED. Successful output preserves the original expiration.

Booking must obtain the two IDs from an authorized server-side booking record, not treat supplied
UUIDs as proof that a customer may pay. Inventory verifies association, not customer authorization.
The read requires no transaction and only sees committed data. It performs no writes, row locks,
renewal, expiration extension or payment calls. Commitment independently rechecks after both locks;
a valid prepayment snapshot may expire or become ineligible before commitment.

The Inventory-side API gap is closed. Actual payment invocation gating and refunds still require
Booking/Payments integration, which these tests do not simulate or claim to prove.

## 2. Additional setCapacity tests

All records use common Catalog fixtures. Results are additional Inventory scope supporting
Administration; no Administration workflow is implemented.

| ID          | Purpose / preconditions / data                           | Steps                                                 | Expected result                                           | Actual result / postconditions                                 | Status | Technique                     |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | ------ | ----------------------------- |
| INV-CAP-T01 | B initially unprovisioned; values 0,10,3                 | Provision then increase/decrease; inspect row/load    | Valid capacity, committed 0, no fabricated Business cabin | All values and single-cabin report matched                     | Pass   | BVA, EP                       |
| T02         | A committed 2 and active held 3                          | Set 5, then 4, then 6                                 | Equality succeeds; 4 BELOW_SOLD with structured counts    | Counts 2/3 returned; final availability 1; all holds preserved | Pass   | BVA, invariant                |
| T03         | A holds 10 but expires exactly now                       | Reduce to 0                                           | Expired holds ignored                                     | Succeeded, available 0                                         | Pass   | Temporal BVA                  |
| T04 (5)     | Invalid capacity -1,0.5,NaN,Infinity,INT_MAX+1           | Submit each                                           | INVALID_CAPACITY                                          | All rejected, original capacity unchanged                      | Pass   | BVA, EP                       |
| T05         | Missing flight then valid B in same transaction          | Attempt missing provisioning, then valid provisioning | FLIGHT_NOT_FOUND; transaction still usable                | Typed error and subsequent successful call                     | Pass   | FK, savepoint recovery        |
| T06         | Two transactions provision B/Economy for first time      | First sets 3; second waits then sets 5                | Unique constraint serializes creation                     | One row, capacity 5; real blocking, no duplicate/error         | Pass   | Concurrency, missing-row race |
| T07         | First transaction holds 8; reduction to 7 waits          | Commit hold; await reduction                          | BELOW_SOLD with 8 held                                    | Capacity unchanged, availability 2                             | Pass   | Concurrency                   |
| T08         | First reduces A to 1; second requests 2 seats            | Complete first; await hold                            | SEATS_UNAVAILABLE                                         | Correct typed conflict                                         | Pass   | Concurrency                   |
| T09         | Provision B and update A in transaction                  | Throw caller error                                    | Both changes roll back                                    | B absent, A capacity 10                                        | Pass   | Fault injection, rollback     |
| T10         | Active hold 3; competing reductions 6 then 2             | Block second; advance to expiry; finish first         | Second samples new clock, accepts 2                       | Final availability 2                                           | Pass   | Concurrency, temporal BVA     |
| T11         | First converts held 2 to committed; reduction to 1 waits | Complete commit, await reduction                      | BELOW_SOLD committed 2 / held 0                           | Capacity preserved, availability 8                             | Pass   | Cross-writer concurrency      |
| T12         | New uncommitted Catalog flight                           | Insert valid flight, provision same Tx, then throw    | FK accepts same-Tx parent; rollback removes both          | No flight/inventory persisted                                  | Pass   | Caller atomicity              |
| T13         | PostgreSQL integer maximum                               | Set capacity 2147483647                               | Accepted without overflow                                 | Available 2147483647                                           | Pass   | BVA                           |
| T14 (2)     | REPEATABLE READ / SERIALIZABLE and autocommit manager    | Invoke both new writers                               | READ COMMITTED / active-Tx usage error                    | Rejected; hold/count unchanged                                 | Pass   | Transaction EP                |

The critical invariant is new capacity >= committed + active held. Inserts use the existing
composite PK and flight FK; no new migration, Catalog relationship or synthetic flight is added.
Only the named missing-flight FK failure is recovered via a savepoint. Unexpected SQL errors
remain errors requiring caller rollback. Savepoints do not independently commit anything.

## 3. Additional cabinLoad tests

| ID           | Purpose / preconditions / data                          | Steps                                                                       | Expected result                                             | Actual result / postconditions                   | Status | Technique                         |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------ | --------------------------------- |
| INV-LOAD-T01 | A/Economy committed 2, active held 3; Business empty    | Call Facade and count repository SQL statements                             | Economy 10/2/3/5, Business 4/0/0/4; one statement           | Both rows and one-query assertion matched        | Pass   | Snapshot, EP                      |
| T02          | Missing flight, valid unprovisioned B, invalid UUID     | Read each                                                                   | ok([]), ok([]), INVALID_FLIGHT_ID                           | All predictable outcomes matched                 | Pass   | EP                                |
| T03          | Fully held 10 seats, then exact expiry                  | Read before/after advancing clock                                           | Held10/available0 becomes held0/available10                 | Matched                                          | Pass   | Temporal BVA                      |
| T04          | 24 generated valid committed/held/capacity combinations | Reset fixture state, generate counts, reserve when needed, read both cabins | Capacity = committed + held + available for every row       | All generated states satisfied equality          | Pass   | Generated-state invariant testing |
| T05          | Uncommitted hold-to-commit transition                   | Read outside transaction, complete commit, read again                       | See either held2/committed0 or held0/committed2, available8 | Both complete states observed; no partial counts | Pass   | Isolation, snapshot consistency   |

Reads use one shared clock instant and one aggregate statement. Missing inventory is represented
by an empty list; it does not assert Catalog existence. SQL produces the same availability formula
used by FBS-21, including its zero clamp. cabinLoad explicitly rejects already-oversold stored
states instead of returning an invariant-breaking report. Direct unsafe SQL is not an allocation API.

## Unit records

All use mocked persistence to isolate rules; database/concurrency claims rely on the tests above.
Common unit fixture: valid held row of 2 seats, clock before expiry, load capacity10/committed2/held3.
All case families are separate from FBS-21/FBS-22 assertions.

| ID              | Purpose / data / steps                                                   | Expected                                                      | Actual / postconditions                            | Status | Technique                       |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- | ------ | ------------------------------- |
| US-INV-03-U01   | Commit uppercase UUID; inspect lock/clock order                          | Normalize ID; cabin then hold then clock; same Tx             | Matched and commit command carried exactly 2 seats | Pass   | Workflow contract               |
| U02 (3)         | Invalid ID bad/empty/null                                                | INVALID_HOLD_ID before persistence                            | Matched, no hold lookup                            | Pass   | EP                              |
| U03             | Initial lookup says HELD; locked reread says COMMITTED                   | NOT_HELD without count update                                 | Matched                                            | Pass   | Mutable-state recheck           |
| U04             | Missing identity row                                                     | NOT_HELD, no cabin lock                                       | Matched                                            | Pass   | EP                              |
| U05 (5)         | Inject error at assertion/find/cabin lock/hold lock/update               | Same unexpected error propagates                              | Matched at all five points                         | Pass   | Fault injection                 |
| INV-CAP-U01 (9) | Invalid UUID/cabin or capacity -1,0.5,Infinity,NaN,INT_MAX+1,string,null | Typed input error before provisioning                         | All partitions matched, no writes                  | Pass   | BVA, EP                         |
| U02             | Capacity4 vs occupied5, then exact5                                      | Structured BELOW_SOLD, then success                           | Counts2/3 retained, no first update                | Pass   | BVA                             |
| U03             | FK-aware provisioning reports missing flight                             | FLIGHT_NOT_FOUND                                              | Matched                                            | Pass   | EP                              |
| INV-LOAD-U01    | Invalid ID then uppercase valid ID                                       | Invalid avoids query; valid normalizes and samples clock once | Matched                                            | Pass   | Input partition, clock contract |

## 4. Actual RED / GREEN / REFACTOR and regression evidence

Commands run from repository root using the existing dedicated SWC cache
(`SWC_NATIVE_BINDING_CACHE=$env:USERPROFILE/.flight-system-swc-native`). App checks use
`API_URL=http://localhost:3001`. Dependencies/infrastructure were not reinstalled or upgraded.

1. **RED, before production edits:**
   - `pnpm --filter api exec vitest run src/modules/inventory/inventory-payment.spec.ts -t US-INV-03-U01`
     failed with `TypeError: api.commit is not a function` (1 failed, 22 deselected).
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-payment.int-spec.ts -t 'US-INV-03-T0[1-4]|INV-CAP-T01|INV-LOAD-T01'`
     produced 4 failures and 2 passes: missing commit/setCapacity caused the new paths to fail;
     existing T01/T02 hold behavior already passed. Remaining cases were explicitly deselected.
2. **GREEN:** implemented the missing operations without changing the hold algorithm or schema.
   Unit run passed 80 Inventory cases. The first PostgreSQL run exposed TypeORM's actual UPDATE
   result shape (`[returnedRows, affectedCount]`, unlike INSERT). Corrected the affected-count
   check; rerunning the new integration file passed all then-current 35 cases (duration 9.95 s).
   Original FBS-21 integration tests also passed in the initial combined run.
3. **REFACTOR:** retained one aggregate formula for availability/load, shared the existing
   transaction guard across writers, made its error wording apply to all Inventory writes, and
   centralized valid-clock checking for the new operations. Added lock-wait, rollback-waiter,
   capacity/commit race and same-Tx parent provisioning regression tests. The final focused runs
   passed 80 Inventory unit tests and 44 new PostgreSQL tests (integration duration 10.56 s).

Previous extended-Inventory repository run, before the prepayment addition (retained history):

| Check                 | Actual result                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm typecheck        | Pass, both apps                                                                                                                                                                            |
| pnpm lint             | Pass                                                                                                                                                                                       |
| pnpm depcruise        | Pass; 129 modules, 333 dependencies, no violations                                                                                                                                         |
| pnpm test             | 177 passed / 20 files; includes all previous 154 cases                                                                                                                                     |
| pnpm test:integration | 168 passed / 9 files; includes all previous 124 cases; duration 38.04 s                                                                                                                    |
| Focused Inventory     | 80 unit cases; 44 new integration cases; all passed                                                                                                                                        |
| FBS-21                | Existing 21 unit + 28 PostgreSQL cases passed, including FK parity and reversibility                                                                                                       |
| FBS-22                | Existing 36 unit + 48 PostgreSQL cases passed without removed assertions                                                                                                                   |
| NFR-CONS-01           | All 20 rounds passed: 50 attempts for 10 seats, exactly10 successes /40 typed conflicts per round; zero overselling/unexpected errors                                                      |
| pnpm build            | API build passed; root command failed because the existing Next.js dependency emitted its security-advisory stop after frontend compilation. No dependency upgrade or bypass flag was used |

No Inventory browser/payment HTTP flow exists, so no end-to-end payment test or booking latency
claim is made. The existing backend HTTP integration suite did run as part of the full suite.
The pre-existing pg client deprecation warning appeared during schema checks and was non-fatal.
Final Prettier checks and `git diff --check` passed. `git status --short` showed nine modified
Inventory files and three new Inventory/test/documentation files, all unstaged and uncommitted.
Existing migrations, FBS-22 documentation and other domain modules have no diff.

## Public outcomes and readiness

`commit(tx, holdId)` and `setCapacity(tx, flightId, cabin, capacity)` return `Result<void, ...>`.
`cabinLoad(flightId)` returns `Result<CabinLoad[], 'INVALID_FLIGHT_ID'>`. Full signatures, structured
BELOW_SOLD information, duplicate/expiry rules and multi-cabin lock order are in the [README](README.md).
No private entity/repository is exported. No migration or persistent database change was necessary.

Inventory-level AC-1/AC-2/AC-3 are verified, including rollback at the future Booking boundary.
The final improvement also verifies AC-4's read-only prepayment rejection and independent late-commit
rejection. Actual gateway invocation gating, Booking confirmation, Payments charges/refunds,
Administration commands, Search wiring, and FBS-24 release remain separate work. The Inventory
implementation is ready for independent review with those integration limits and the frontend
build failure disclosed; it is not a claim of complete payment integration, merge or Jira Done.

## 5. Prepayment validation improvement — executed records

The existing FBS-23 uncommitted work was inspected and retained on the same branch at `7d82bbb`.
No prior test case or assertion was removed. No new file, package, migration, HTTP route, payment
implementation or customer-authorization code was introduced by this addition.

### PostgreSQL prepayment records (15 cases)

These inherit the common disposable-database setup and fixed clock. Each case creates a default
two-seat hold for a fresh booking unless stated otherwise. All trace to US-INV-03 / AC-4, with
successful/failed commitment also exercising AC-3. Purpose/data/steps and actual postconditions
are recorded below; no gateway mock is presented as real Payments integration.

| ID            | Purpose / data / steps                                                                               | Expected result                                                               | Actual result / postconditions                                  | Status | Technique                         |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ | --------------------------------- |
| US-INV-03-P01 | Submit uppercase valid hold and expected booking UUIDs                                               | Eligibility with canonical IDs and original expiresAt                         | Exact metadata returned                                         | Pass   | EP, normalization                 |
| P02 (3)       | Set clock to expiration minus 1 ms, equal, plus 1 ms                                                 | Only before-expiry succeeds; equal/after HOLD_EXPIRED                         | All boundaries matched                                          | Pass   | BVA                               |
| P03           | Unknown hold and booking UUIDs                                                                       | NOT_HELD                                                                      | Matched                                                         | Pass   | EP                                |
| P04 (2)       | Malformed hold ID or booking ID                                                                      | INVALID_HOLD_ID / INVALID_BOOKING_ID                                          | Matched                                                         | Pass   | Input EP                          |
| P05 (3)       | Persist COMMITTED via commit, or set RELEASED / EXPIRED fixtures; call both APIs                     | NOT_HELD for committed/released; HOLD_EXPIRED for expired                     | Validation and commit agreed in all three states                | Pass   | State transition, consistency     |
| P06           | Use another booking's UUID before and after hold expiry                                              | NOT_HELD without leaking expiry of the mismatched hold                        | Matched both times                                              | Pass   | Association/security partition    |
| P07           | Validate at now, +60 sec, and expiry minus 1 ms; snapshot both tables                                | Same original expiration; exactly one SELECT per call; no row locks or writes | All seat_holds and cabin_inventory values unchanged; no renewal | Pass   | Read-only and temporal invariants |
| P08           | Validate, then commit using caller transaction                                                       | Both succeed                                                                  | COMMITTED, committedSeats 2, available 8                        | Pass   | State transition                  |
| P09           | Validate, advance past expiry, attempt commit, validate again                                        | HOLD_EXPIRED from both later calls                                            | HELD/count0 preserved; original timestamp unchanged             | Pass   | BVA, temporal interleaving        |
| P10           | Create a hold in an open transaction; validate from default manager; commit creation; validate again | Uncommitted creation invisible; committed creation eligible                   | NOT_HELD then success                                           | Pass   | Transaction visibility            |

### Unit prepayment records (16 cases)

Common unit fixture is a matching HELD row with expiration one second after the fixed clock.

| ID             | Purpose / data / steps                               | Expected result                                      | Actual result / postconditions              | Status | Technique                    |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- | ------ | ---------------------------- |
| US-INV-03-PU01 | Validate uppercase hold/booking IDs                  | Normalized lookup and original expiration metadata   | Exact arguments/result matched              | Pass   | Contract                     |
| PU02 (3)       | Expiry offsets -1/0/+1 ms                            | Eligible only at -1 ms                               | All matched                                 | Pass   | BVA                          |
| PU03 (3)       | COMMITTED, RELEASED, EXPIRED status                  | Same errors as commit                                | All matched                                 | Pass   | State EP                     |
| PU04           | Repository reports unknown/mismatched hold           | NOT_HELD                                             | Matched                                     | Pass   | EP                           |
| PU05 (3)       | bad/empty/null in either identifier                  | Correct identifier error without persistence         | Both fields checked in every partition      | Pass   | EP                           |
| PU06           | Validate matching live hold                          | No transaction assertion, row lock or mutation calls | Only read path used                         | Pass   | Read-only workflow           |
| PU07           | Delay lookup, advance clock to expiry, finish lookup | Clock sampled after lookup; HOLD_EXPIRED             | Matched                                     | Pass   | Async temporal boundary      |
| PU08           | Repository read rejects                              | Same unexpected error propagates                     | Matched                                     | Pass   | Fault injection              |
| PU09           | Invalid injected clock                               | Programming error, no false eligibility              | Matched                                     | Pass   | Invalid dependency partition |
| PU10           | Mutate the returned Date                             | Stored record object unchanged                       | Defensive timestamp copy preserved original | Pass   | Encapsulation                |

### Actual RED → GREEN → REFACTOR

1. Added the above tests before implementing the public method.
   - `pnpm --filter api exec vitest run src/modules/inventory/inventory-payment.spec.ts -t US-INV-03-PU01`
     failed: `TypeError: api.validateForPayment is not a function` (1 failed, 38 explicitly deselected).
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-payment.int-spec.ts -t US-INV-03-P01`
     failed for the same missing method (1 failed, 58 explicitly deselected).
2. GREEN: added the API/types, Facade/service method and booking-bound parameterized repository
   SELECT; extended only the existing mock fixtures as necessary. Full focused files passed
   **39 unit cases and 59 PostgreSQL cases**. API TypeScript check passed.
3. REFACTOR: shared state/expiry rules in `holdEligibilityError`. The existing commit path invokes
   it only after the cabin and hold locks, with the same state ordering and `expiresAt <= now`
   boundary. Validation invokes it after the persisted read. Focused Inventory unit regression
   then passed **96 cases**. Full repository tests below verified all original lock-wait and
   rollback regressions after this extraction.

### Final verification after prepayment addition

Environment remains Node 24.22.1 / pnpm 12.10.1, using the existing SWC native cache and Testcontainers.

| Command / evidence                | Actual result                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm typecheck                    | Passed both apps                                                                                                                                                        |
| pnpm lint                         | Passed                                                                                                                                                                  |
| pnpm depcruise                    | Passed; 129 modules, 333 dependencies, no violations                                                                                                                    |
| pnpm test                         | **193 passed / 20 files**, including all previous 177 cases                                                                                                             |
| pnpm test:integration             | **183 passed / 9 files**, including all previous 168 cases; 33.92 seconds                                                                                               |
| New prepayment cases              | **16 unit + 15 PostgreSQL passed**                                                                                                                                      |
| Focused FBS-23 files              | **39 unit + 59 PostgreSQL passed**                                                                                                                                      |
| Focused Inventory unit regression | **96 passed**                                                                                                                                                           |
| FBS-22 stress                     | All 20 repetitions passed, each 50 attempts /10 successes /40 typed conflicts; no overselling or unexpected transaction errors                                          |
| pnpm build                        | API passed; root command failed on the pre-existing Next.js security advisory after frontend compilation. Dependencies were not changed and no security bypass was used |

The non-fatal pg client deprecation warning recurred during schema inspection. No real gateway
call, charge/refund behavior, payment end-to-end flow or booking performance percentile is claimed.
Booking must enforce authorization and gateway gating, then call commit after payment; Payments
must compensate a successful charge when commitment is rejected. All Inventory-side AC-1–AC-4
checks are now available and covered; the overall payment workflow remains integration work.

# FBS-24 — Release seats exactly once: Lab 7 records

**Story:** US-INV-04. **Execution date:** 2026-11-12.
**Branch:** `feature/fbs-24-release-seats`. **Starting commit:** `d0c0cc0`.
The branch was already correct and the working tree clean. No branches were switched/created,
and no commits, pushes, PR changes or Jira writes were performed.

Sources: owner's FBS-24 instructions, current Inventory code/schema and read-only live
[FBS-24](https://momowalid73.atlassian.net/browse/FBS-24) and
[FBS-69](https://momowalid73.atlassian.net/browse/FBS-69) descriptions. The original
`03-inventory.pdf` was not available in the workspace. Its simplified release outcomes are
preserved using the existing typed Result convention; no claim of reading the PDF is made.

## Public contract and state decisions

```ts
release(tx: Tx, holdId: string, options?: ReleaseOptions):
  Promise<Result<ReleaseOutcome, ReleaseError>>;
type ReleaseOutcome = 'RELEASED' | 'ALREADY_RELEASED';
type ReleaseError = 'INVALID_HOLD_ID' | 'INVALID_REQUEST';
interface ReleaseOptions { readonly expiredOnly?: boolean; }
```

UUID validation precedes persistence and IDs normalize to lowercase. A well-formed missing hold
returns ALREADY_RELEASED: no reservation remains to change, so no new not-found error is necessary.
Malformed options return INVALID_REQUEST. Valid requests require an active caller-owned READ
COMMITTED transaction; transaction misuse/unexpected database failures throw rather than becoming
business outcomes. Caller authorization and cancellation eligibility stay outside Inventory.

Normal cancellation releases HELD, COMMITTED and EXPIRED rows, preserving all historical columns
except status. COMMITTED decrements committedSeats by exactly its seat count; HELD/EXPIRED do not.
RELEASED is a complete mutation no-op. No separate available-seat counter exists.

The optional **expiredOnly** predicate is a safety addition: expiry callers must use it to require
the locked row still be HELD and `expiresAt <= now`. Other states or unexpired holds return
ALREADY_RELEASED without mutation, meaning no release applies to that request, not necessarily
that the persisted status is RELEASED. This prevents a stale expiry candidate from releasing a
paid booking. Passing the original expiration time alone is never grounds to release COMMITTED seats.

Commit/release share one identity/lock helper: unlocked identity read, cabin FOR UPDATE, hold FOR
UPDATE, immutable identity check and reread state. Expiry checks occur after both locks. Multi-cabin
callers retain ascending normalized flight-ID/cabin ordering and sequential calls. The transaction
owner rolls back all cancellation work on failure. Existing CHECK/FK constraints and all prior
migrations remain unchanged; no new schema, scheduler, package or HTTP route is introduced.

## Environment and common fixture

Node 24.22.1, pnpm 12.10.1, existing Vitest/TypeORM/PostgreSQL 18 Testcontainers infrastructure.
All database changes below use this suite's newly created disposable database URL. No local/demo
records, volumes or migration state are changed.

Common preconditions: migrations applied; seeded MS/CAI/LHR reference data; valid Catalog flights
A and B; A/Economy capacity10, A/Business capacity4, B/Economy capacity10; committed counts0 and
no holds. Each case resets only its own disposable fixture. Clock starts at
`2026-11-12T12:00:00Z`. Default test hold is A/Economy, 2 seats, fresh booking UUID, 900 seconds.
Paid fixtures call the real commit Facade before testing release.

[Unit tests](inventory-release.spec.ts): **34 cases** (24 original +10 defensive-options cases).
[PostgreSQL tests](../../../test/inventory-release.int-spec.ts): **43 cases**.
Integration tests use only Inventory's public index and a separate Nest consumer module injecting
INVENTORY_API. Row-history comparisons and cabinLoad verify counters as well as outcomes.

## Official acceptance records

### US-INV-04-T01 — Three trigger contracts (3 cases)

| Field           | Record                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| User Story / AC | US-INV-04 / AC-1                                                                            |
| Purpose         | One Inventory release mechanism for traveler, expiry and airline callers                    |
| Preconditions   | Common fixture; traveler/airline fixtures COMMITTED, expiry fixture HELD                    |
| Test Data       | Two seats; expiry clock advanced exactly 900 seconds                                        |
| Steps           | Simulate each caller using the same Facade; expiry passes expiredOnly; complete transaction |
| Expected        | RELEASED, committed0, activeHeld0, available10                                              |
| Actual          | All three cases matched; no alternate release algorithm used                                |
| Postconditions  | Hold history retained in RELEASED state                                                     |
| Status          | Pass at Inventory boundary; actual cancellation handlers/job are not implemented            |
| Technique       | EP by trigger/state, state transition, integration                                          |

### US-INV-04-T02 — Idempotency (2 cases)

| Field           | Record                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| User Story / AC | US-INV-04 / AC-2                                                                                   |
| Purpose         | Repeated release never changes counts twice                                                        |
| Preconditions   | Common fixture with one HELD or one COMMITTED reservation                                          |
| Test Data       | Same hold ID twice; first call also tests uppercase normalization                                  |
| Steps           | Assert availability8; release once; snapshot both tables; release again; compare tables/history    |
| Expected        | RELEASED then ALREADY_RELEASED; no second mutation; committed0 and available10                     |
| Actual          | Both state partitions passed complete table equality and original booking/expiry/seat preservation |
| Postconditions  | One RELEASED row; counters never negative or above capacity                                        |
| Status          | Pass                                                                                               |
| Technique       | Idempotency, retry reliability, state transition                                                   |

### US-INV-04-T03 — Concurrent release (10 cases)

| Field           | Record                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| User Story / AC | US-INV-04 / AC-3                                                                                                             |
| Purpose         | Exactly one transition with two independent concurrent callers                                                               |
| Preconditions   | Common fixture; 5 HELD and 5 COMMITTED cases; two active READ COMMITTED connections with distinct backend PIDs               |
| Test Data       | Two release requests for the same hold                                                                                       |
| Steps           | Open a common start barrier; call release in both transactions; await every outcome and completion; inspect persisted counts |
| Expected        | One RELEASED, one ALREADY_RELEASED, no rejected promises; committed0, available10                                            |
| Actual          | All 10 repetitions passed; exactly one transition and no unexpected errors per repetition                                    |
| Postconditions  | One RELEASED row per fresh case, no double decrement                                                                         |
| Status          | Pass                                                                                                                         |
| Technique       | Real PostgreSQL concurrency, repetition, synchronized start                                                                  |

## Supplemental PostgreSQL records

All rows inherit US-INV-04 and the common fixture; IDs below have prefix US-INV-04.
All Actual fields are observed outcomes, not predicted results.

| ID      | AC / purpose / data and preconditions                                                  | Steps                                                                                                          | Expected result                                            | Actual result / postconditions                               | Status | Technique                            |
| ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------ | ------------------------------------ |
| T04 (2) | AC-2; malformed ID / well-formed unknown UUID                                          | Call release                                                                                                   | INVALID_HOLD_ID / ALREADY_RELEASED                         | Both matched, no new row                                     | Pass   | EP                                   |
| T05     | AC-1/2; HELD row already expired                                                       | Read load, expiry-release twice                                                                                | Available10 before and after; second no-op                 | No second availability increment; count0                     | Pass   | Temporal state transition            |
| T06 (3) | AC-1; expiry offsets -1/0/+1 ms                                                        | Call expiredOnly release                                                                                       | Before expiry skipped; exact/after released                | Correct persisted status/count for all boundaries            | Pass   | BVA                                  |
| T07     | AC-1; worker discovered HELD before it became COMMITTED                                | Commit; advance beyond original expiry; guarded release; explicit cancellation                                 | Expiry skip preserves paid seats; cancellation may release | COMMITTED/count2/available8 preserved until explicit release | Pass   | Stale discovery, state transition    |
| T08     | AC-1; persisted EXPIRED fixture                                                        | Explicit release                                                                                               | Status RELEASED, no decrement                              | Matched, count0                                              | Pass   | EP                                   |
| T09     | AC-1; paid hold, caller cancellation fails after release                               | Throw before transaction completion                                                                            | Original COMMITTED/count2 restored                         | Matched, availability8                                       | Pass   | Fault injection, rollback            |
| T10     | NFR-CONS-02; paid hold, trigger rejects RELEASED status update                         | Decrement executes; trigger raises; caller transaction fails; remove test-only trigger                         | Neither change persists                                    | Original COMMITTED/count2 restored                           | Pass   | Database fault injection             |
| T11     | Database invariant; deliberately corrupted direct fixture has paid hold but committed0 | Attempt release                                                                                                | Named CHECK rejects negative count                         | SQLSTATE23514, status remains COMMITTED; no silent clamp     | Pass   | Constraint / failure boundary        |
| T12     | Caller transaction contract; autocommit manager and unknown ID                         | Call release                                                                                                   | Active-transaction usage error                             | Rejected                                                     | Pass   | Transaction EP                       |
| T13 (8) | AC-3; all cross-writer races listed below                                              | Keep first write uncommitted; start second; observe pg_blocking_pids; finish or roll back first; finish second | Correct serial result, no deadlock, load invariant         | All eight matched, Business and other flight unchanged       | Pass   | Observed server contention           |
| T14     | AC-2; two paid reservations of 2 and 3 seats in one cabin                              | Release first twice                                                                                            | Second reservation retained; committed3, available7        | Matched, only two seats removed from committed               | Pass   | Independent reservation isolation    |
| T15 (2) | Wrong isolation: REPEATABLE READ / SERIALIZABLE                                        | Attempt release                                                                                                | READ COMMITTED usage error                                 | Hold/count preserved                                         | Pass   | Isolation EP                         |
| T16 (5) | AC-3; expired HELD, expiry and traveler callers                                        | Start both independent transactions behind barrier; guarded expiry vs normal cancellation                      | One transition and one already outcome                     | All five repetitions passed; count0, available10             | Pass   | Mixed-caller concurrency, repetition |

T13 explicitly observes PostgreSQL blocking rather than depending on an arbitrary sleep:

| Race                                            | Observed serial outcome                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Commit wins, cancellation waits                 | Cancellation rereads COMMITTED and releases/decrements once                    |
| Release wins, commit waits                      | Commit returns NOT_HELD                                                        |
| First release rolls back, another release waits | Waiting release succeeds once against restored state                           |
| Expiry releases, cancellation waits             | Cancellation returns ALREADY_RELEASED                                          |
| Release then new hold                           | Waiting request can hold all 10 newly free seats                               |
| Release then capacity reduction                 | Waiting capacity0 update succeeds after paid seats are freed                   |
| Capacity reduction then release                 | Capacity2 remains valid; release frees paid count without overwriting capacity |
| Commit then stale expiry candidate              | Guarded expiry skips COMMITTED even after original deadline                    |

All race connections have local lock_timeout5s / statement_timeout8s. Cases fail if expected
blocking is absent, outcomes differ, an unexpected promise rejects, or counts break the invariant.
The barriers coordinate starts of real transactions; they do not replace database locking.

## Unit records (24 cases)

Common mocked fixture: matching HELD row of 2 seats expiring one second after fixed clock;
repository lock/transition calls succeed. These isolate rules; database correctness is tested above.

| ID            | Purpose / data / steps                                               | Expected result                                                          | Actual / postconditions             | Status                               | Technique           |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------ | ------------------- |
| US-INV-04-U01 | Uppercase ID; inspect caller Tx and lock order                       | Canonical ID; cabin before hold; unchanged hold passed to private writer | Matched                             | Pass                                 | Contract / ordering |
| U02 (3)       | HELD, COMMITTED, EXPIRED                                             | Explicit release                                                         | RELEASED for each                   | Matched                              | Pass                | State EP              |
| U03           | Identity lookup HELD, locked reread RELEASED                         | Release                                                                  | ALREADY_RELEASED; no update         | Matched                              | Pass                | Mutable-state recheck |
| U04 (3)       | bad/empty/null hold ID                                               | Release                                                                  | Typed invalid ID before persistence | Matched                              | Pass                | Validation EP         |
| U05           | Missing identity                                                     | Release                                                                  | ALREADY_RELEASED, no mutation       | Matched                              | Pass                | EP                    |
| U06 (3)       | expiredOnly offsets -1/0/+1 ms                                       | Guarded release                                                          | Before skip; exact/after transition | Matched, only applicable cases write | Pass                | BVA                   |
| U07 (3)       | Guarded COMMITTED, RELEASED, EXPIRED after timestamp                 | Expiry-only call                                                         | No mutation for each                | Matched                              | Pass                | Paid-seat safety / EP |
| U08 (5)       | Inject unexpected error in guard/identity/cabin lock/hold lock/write | Release                                                                  | Original error propagates           | Matched at all five points           | Pass                | Fault injection       |
| U09 (4)       | null/array/non-boolean expiry options                                | Release                                                                  | INVALID_REQUEST before persistence  | Matched                              | Pass                | Input EP              |

## Executed RED → GREEN → REFACTOR

Use the existing Windows SWC cache (`SWC_NATIVE_BINDING_CACHE=$env:USERPROFILE/.flight-system-swc-native`)
and API_URL=http://localhost:3001 for project checks. No dependencies or infrastructure were reset.

1. **RED before production changes:**
   - `pnpm --filter api exec vitest run src/modules/inventory/inventory-release.spec.ts -t US-INV-04-U01`
     failed with `TypeError: api.release is not a function` (1 failed, 19 explicitly deselected).
   - `pnpm --filter api exec vitest run --config vitest.integration.config.mts test/inventory-release.int-spec.ts -t US-INV-04-T02`
     failed on both HELD/COMMITTED idempotency cases for the same missing method
     (2 failed, 33 explicitly deselected).
2. **GREEN:** added the Result-wrapped release API, state guards and conditional repository writes.
   The first unit run passed all then-current 116 Inventory cases; the PostgreSQL release file
   passed all then-current 35 cases. Typecheck caught test-only Result.value accesses without
   narrowing; assertions were corrected to compare complete typed results. Lint caught an
   unnecessary test cast; it was removed. No assertions were weakened.
3. **REFACTOR:** extracted the identical lifecycle lock sequence into a private helper shared by
   commit/release, preserving post-lock commitment expiry checks. Added invalid-options, paid
   reservation isolation, unsupported-isolation and five mixed expiry/cancellation race cases.
   Focused commands then passed **120 Inventory unit tests** and **43 release PostgreSQL tests**.
   The latter took 10.70 seconds locally. This is test-harness duration, not booking latency.

## Original release implementation verification (before defensive-options improvement)

| Command / evidence          | Actual result                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| pnpm typecheck              | Passed both apps                                                                                                     |
| pnpm lint                   | Passed                                                                                                               |
| pnpm depcruise              | Passed; 131 modules, 342 dependencies, no violations                                                                 |
| pnpm test                   | **217 passed /21 files**, including all previous 193 cases                                                           |
| pnpm test:integration       | **226 passed /10 files**, including all previous 183 cases; 47.26 seconds                                            |
| New FBS-24 tests            | **24 unit +43 PostgreSQL cases passed**                                                                              |
| Existing FBS-21             | 21 unit +28 PostgreSQL cases passed, including FK integrity/parity and migration reversal                            |
| Existing FBS-22             | 36 unit +48 PostgreSQL cases passed                                                                                  |
| Existing FBS-23             | 39 unit +59 PostgreSQL cases passed                                                                                  |
| NFR-CONS-01                 | All20 stress rounds passed; each50 requests /10 successes /40 typed conflicts; zero overselling/unexpected errors    |
| pnpm build                  | Root command failed at the existing Next.js security-advisory stop; API build was cancelled by the recursive command |
| pnpm --filter api run build | Independently passed                                                                                                 |

No unrelated dependency upgrade or security bypass was used. The existing pg client deprecation
warning during schema checks remained non-fatal. No Inventory HTTP cancellation/browser flow
exists, so none is claimed verified; the full existing backend HTTP regression suite did run.
Final formatting, whitespace and Git checks accompany the handoff.

## FBS-69 readiness matrix

This assesses local Beta evidence; it does **not** mark FBS-69 Done or satisfy Jira merge policy.

| Requirement        | Executed local evidence                                                                                              | Remaining evidence / gate                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| FBS-21 / US-INV-01 | Formula, cabin/passenger/infant partitions, expiry boundaries, batching, missing data, FK constraints/parity         | Search consumption and relevant end-to-end paths                                                                       |
| FBS-22 / US-INV-02 | Last-seat contention, post-lock reads, transaction rollback, independent cabins, ordered multi-flight callers        | Actual shared Booking transaction endpoint                                                                             |
| FBS-23 / US-INV-03 | 15-minute holds, prepayment eligibility/association, expiry, exactly-once commit, rollback, capacity/load invariants | Customer authorization, real gateway gating, confirmation/refund compensation                                          |
| FBS-24 / US-INV-04 | New T01/T02/T03 plus T04–T16; all three simulated callers use same release; duplicate/mixed races and rollback       | Actual traveler/airline cancellation dispatch and expiry scheduling/discovery                                          |
| NFR-CONS-01        | Existing 50-for-10 stress, 20 repetitions, passed unchanged                                                          | CI execution/evidence attachment                                                                                       |
| NFR-CONS-02        | Hold/commit rollback plus new release caller and database-trigger failures preserve atomic state                     | Cross-module cancellation/payment failure scenarios                                                                    |
| NFR-REL-02         | Inventory retry/idempotency and duplicate/conflicting-caller evidence in T02/T03/T13/T16                             | Full system reliability criteria/end-to-end evidence; original PDF wording unavailable, so not claimed fully satisfied |
| NFR-PERF-02        | No applicable create-booking HTTP endpoint exists                                                                    | Measure create-booking p95 <=1 second at20 concurrent users after integration; stress duration is not a substitute     |
| Quality / delivery | Local typecheck/lint/architecture/tests/API build passed                                                             | Existing root frontend advisory; independent review, CI links/evidence and applicable upstream/main merges             |

## Integration responsibilities and final assessment

- Booking owns customer authorization, cancellation eligibility, booking/hold association, its own
  state changes and rollback of the shared caller transaction. A returned business error does not
  automatically roll back earlier caller work.
- Airline cancellation's owning workflow identifies affected bookings/holds and calls the same
  Facade in the consistent lock order. Inventory does not authorize or initiate flight cancellation.
- The future expiry worker must obtain IDs through Inventory-owned candidate discovery, schedule
  work/retries, and always use expiredOnly. Candidate discovery/scheduling is not implemented;
  other modules must not query private Inventory tables directly.
- Payments owns refund/compensation; Ticketing and Notifications own their side effects. Search
  consumes existing availability; Administration consumes existing capacity/load operations.
- Full cancellation/payment HTTP paths and booking performance remain integration-dependent.

Per-ID Inventory release and all three Inventory-level ACs are implemented and verified by the
executed tests. Original migrations/entities/constraints, public existing operations and FBS-22/
FBS-23 test documents are preserved. No persistent demonstration data was touched. The code is
prepared for independent review with the root build advisory and integration gates disclosed;
no claim of overall system completion, merged upstream work or Jira Done is made.

## Final defensive-options improvement

An independent review identified that unknown option properties were ignored. A misspelling such
as `{ expireOnly: true }` could therefore select ordinary cancellation rather than expiry-only
release. The correction adds one allowed-key check to the existing guard using `Reflect.ownKeys`.
Only the documented own key `expiredOnly` is accepted, including when inspecting non-enumerable
and symbol keys. Unknown keys return the existing `INVALID_REQUEST` before any repository access.
The existing boolean/default handling and public TypeScript signature remain unchanged.

This task modified only `inventory.service.ts`, `inventory-release.spec.ts`, `README.md`, and
this document, preserving all existing uncommitted FBS-24 work. No state transition, counter
update, lock, transaction, expiration rule, schema, dependency, lockfile or frontend code changed.

### New validation records

All records trace to US-INV-04 defensive input validation. Common preconditions: the unit fixture
above has an unexpired HELD reservation, mocked repository methods and a deterministic clock.
These tests exercise the public Facade. Only the malformed-input table deliberately casts unknown
runtime values to ReleaseOptions; valid configurations use the public TypeScript types directly.

| Case            | Input / steps                                                                     | Expected result                                              | Actual result / postconditions       | Status | Technique                        |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ------ | -------------------------------- |
| US-INV-04-U10/1 | Omitted options (undefined default; existing U01 also uses the two-argument call) | Accepted; RELEASED                                           | Matched                              | Pass   | Default boundary                 |
| U10/2           | Empty options object                                                              | Accepted; RELEASED                                           | Matched                              | Pass   | EP, backward compatibility       |
| U10/3           | `{ expiredOnly: true }` on the unexpired fixture                                  | Accepted; ALREADY_RELEASED, no expiry release applicable yet | Matched                              | Pass   | Valid boolean partition          |
| U10/4           | `{ expiredOnly: false }`                                                          | Accepted; normal cancellation RELEASED                       | Matched                              | Pass   | Valid boolean partition          |
| U10/5           | `{ expiredOnly: undefined }`                                                      | Preserve existing default behavior                           | Accepted; RELEASED                   | Pass   | Backward compatibility           |
| US-INV-04-U11/1 | `{ expireOnly: true }`                                                            | INVALID_REQUEST                                              | Matched; zero repository/clock calls | Pass   | Misspelling partition            |
| U11/2           | `{ expiredOnly: true, unknown: 123 }`                                             | INVALID_REQUEST                                              | Matched; zero repository/clock calls | Pass   | Extra-key partition              |
| U11/3           | `{ expiredOnly: 'true' }`                                                         | INVALID_REQUEST                                              | Matched; zero repository/clock calls | Pass   | Invalid boolean partition        |
| U11/4           | Non-enumerable own key named expireOnly                                           | INVALID_REQUEST                                              | Matched; zero repository/clock calls | Pass   | Runtime key enumeration boundary |
| U11/5           | Unknown symbol own key                                                            | INVALID_REQUEST                                              | Matched; zero repository/clock calls | Pass   | Runtime key enumeration boundary |

Invalid cases assert that **every** repository mock was untouched, including transaction guards,
queries, locks and mutation methods, and that the clock was not sampled. Existing U09 assertions
were strengthened to apply this same guarantee to null, array and non-boolean configurations.
No additional PostgreSQL cases were needed for a pure guard that exits before all database access;
the full existing PostgreSQL suite was still executed.

### Executed RED → GREEN → REFACTOR

1. RED: added U10/U11 before editing the validator. Ran
   `pnpm --filter api exec vitest run src/modules/inventory/inventory-release.spec.ts -t 'US-INV-04-U1[01]'`.
   Observed **4 failed, 6 passed, 24 explicitly deselected**. Misspelled, non-enumerable and symbol
   keys incorrectly returned RELEASED; an extra key beside a valid guard returned ALREADY_RELEASED.
   All should have returned INVALID_REQUEST. This recorded the real defect before its correction.
2. GREEN: added the single allowed-key expression; reran the full release unit file.
   **34/34 passed**.
3. REFACTOR/review: kept the existing guard readable without adding an unnecessary validator
   abstraction. Strengthened older U09 invalid-input assertions to cover all repository methods
   and the clock. The subsequent focused Inventory run passed **130 cases**, and all full
   regressions below passed after this test cleanup.

### Actual final verification for the defensive improvement

Node 24.22.1 / pnpm 12.10.1, existing SWC cache and PostgreSQL Testcontainers infrastructure.

| Check                        | Actual result                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Focused release unit file    | **34 passed**                                                                                                                |
| Focused Inventory unit suite | **130 passed**                                                                                                               |
| pnpm typecheck               | Passed both apps                                                                                                             |
| pnpm lint                    | Passed                                                                                                                       |
| pnpm depcruise               | Passed;131 modules /342 dependencies, no violations                                                                          |
| pnpm test                    | **227 passed /21 files**, including all previous217 cases                                                                    |
| pnpm test:integration        | **226 passed /10 files**, no removed or added integration cases;44.32 seconds                                                |
| FBS-22 stress                | All20 repetitions passed;50 attempts for10 seats,10 successes and40 typed conflicts each; zero overselling/unexpected errors |
| pnpm --filter api run build  | Passed independently                                                                                                         |

The root/frontend build was not rerun for this scoped improvement. Its previously reported Next.js
security advisory remains outside scope; no dependency change or security bypass was attempted.
The non-fatal pg client deprecation warning recurred during schema checks. Final Prettier,
whitespace and Git checks accompany the handoff. All existing delivery/integration gates in the
FBS-69 matrix remain unchanged; the code is ready for commit review, not automatically committed.

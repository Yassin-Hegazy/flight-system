# Administration

All routes require an administrator session. Use `POST /users/sign-in` in Swagger at
`http://localhost:3001/docs`. A traveler receives 403 and an unauthenticated caller receives 401
for valid requests to these routes.

| Story    | Routes                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| US-AD-01 | `POST /admin/flights`                                                               |
| US-AD-02 | `PATCH /admin/flights/{id}/status`                                                  |
| US-AD-03 | `PUT /admin/flights/{id}/capacity/{cabin}`, `PUT /admin/flights/{id}/fares/{cabin}` |
| US-AD-04 | `POST /admin/flights/{id}/cancel`                                                   |
| US-AD-05 | `GET /admin/flights/{id}/load`, `GET /admin/flights/{id}/manifest`                  |
| US-AD-06 | `GET`, `PUT`, and `DELETE /admin/airports/{code}`                                   |
| US-AD-07 | `GET /admin/audit?flightId={id}&page=1`                                             |
| US-AD-08 | `POST /admin/flights/recurring`                                                     |

## Swagger walkthrough

1. Run `pnpm install`, `pnpm bootstrap`, and `pnpm --filter api dev`. Sign in as the seeded
   administrator. Create a CAI → LHR flight with seats using the Swagger example. Choose a future
   departure and save the returned flight ID. Look up the flight by route and Cairo date in
   `GET /flights`.
2. Use the capacity and fare endpoints with `ECONOMY` as the cabin. The fare is in minor units
   and must use the flight's currency.
3. Sign in as the seeded traveler, reserve an economy seat, and pay with `tok_success` and a fresh
   `Idempotency-Key`. Sign back in as administrator. Check the flight load and manifest. The current
   single-passenger Booking flow snapshots the traveler's account name when reserving a seat.
4. Delay the flight, then cancel it with a reason. Check the audit trail filtered by flight ID.
   Sign in as the traveler to see the cancellation notification and the refund in the receipt.
5. Try the recurring-flight example with future dates and an unused flight number. Weekdays are
   ISO 1–7 and the departure is airport-local. The date range is inclusive and at most 90 days
   apart. A skipped local time rejects the series with the affected date. An ambiguous time uses
   its first occurrence.

Swagger adds the CSRF header. In Postman, retain the session cookie and send
`X-Requested-With: postman` on writes.

## Architecture and oral questions

- **What does Command buy us?** Each command declares its write and audit changes. The command bus
  authorizes, opens the transaction, writes the audit entries, commits, and publishes notifications.
  The manifest, flight load and audit queries do not create audit entries.
- **What happens if a cancellation fails midway?** Catalog changes the flight status, Booking
  releases seats, Ticketing voids tickets, and Payments records refunds in the same transaction.
  An error rolls all of those writes back. The gateway is called after commit.
- **How does recurring creation stay atomic?** Every date runs the same Catalog and Inventory
  rules as an individual flight. Savepoints let validation continue after a duplicate. The outer
  transaction rolls the entire series back if any date fails.

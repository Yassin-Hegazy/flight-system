# Postman collection

`flight-booking-api.postman_collection.json` calls every API endpoint (43 operations, 65
requests), in the order of a demo. Each request checks its status code and passes the IDs it
receives (flight, booking reference, ticket number) to the requests after it.

## Run it

1. Start the stack with demo data: `pnpm bootstrap`, then `pnpm dev` (API on port 3001).
2. In Postman, import both files in this folder and select the **Flight Booking API (local)**
   environment.
3. Run the collection (Run collection → Run), or send the requests one by one from the top.

From the command line:

```sh
npx newman run docs/postman/flight-booking-api.postman_collection.json \
  -e docs/postman/local.postman_environment.json
```

The run can be repeated against the same database: it registers a new traveler and creates new
flights each time.

## What it walks through

| Folder                               | Who            | Covers                                                                                                                                                          |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Health and reference data         | anyone         | health, airport suggestions, flights on a route, one flight                                                                                                     |
| 2. Administration: schedule a flight | administrator  | create the demo and return flights, capacity, fare, load, a second admin, a recurring series, airports                                                          |
| 3. Search and comparison             | anyone         | one way, filters and paging, round trip, a validation error                                                                                                     |
| 4. Account (Users and Access)        | a new traveler | register, sign in, profile, password, saved travelers, sign out                                                                                                 |
| 5. Booking and payment               | demo traveler  | a family booking at the displayed total, the same Idempotency-Key replayed, a changed price refused, list bookings, pay, receipt, a declined card, a round trip |
| 6. Tickets                           | demo traveler  | the booking's tickets, one ticket, the printable e-ticket, the round trip's ticket per leg                                                                      |
| 7. Administration: operate           | administrator  | manifest, delay and cancel a flight, the audit trail                                                                                                            |
| 8. Cancellation                      | demo traveler  | cancel, the void ticket, the refund on the receipt                                                                                                              |
| 9. Notifications                     | demo traveler  | inbox, mark read, email preferences                                                                                                                             |

## Good to know

- Sessions are cookies. Each folder signs in first, and Postman keeps the cookie for the requests
  that follow.
- The collection adds the `X-Requested-With` header to every state-changing request; the API
  refuses those without it (CSRF).
- The demo accounts come from `pnpm bootstrap`; change them in the environment if yours differ.
- The response examples shown in Swagger (`/docs`) were recorded from a run of this collection
  (`apps/api/src/openapi-examples.ts`).

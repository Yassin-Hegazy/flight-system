# Payments

Payments implements the six S3 stories using a simulated gateway. The API accepts a provider token
and an idempotency key. Booking supplies the payer's saved fare and Inventory hold.

| Route                                 | Purpose                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `POST /bookings/{reference}/payments` | Pay or replay an attempt with the same `Idempotency-Key`.                   |
| `GET /bookings/{reference}/receipt`   | Read your payment and any pending or completed refund.                      |
| `POST /bookings/{reference}/cancel`   | Cancel your confirmed booking at least 24 hours before scheduled departure. |
| `POST /admin/flights/{id}/cancel`     | Cancel a flight as an administrator and refund affected paid bookings.      |

## Swagger demo

1. Run `pnpm bootstrap` and `pnpm --filter api dev`. Open <http://localhost:3001/docs>.
2. Sign in as the seeded administrator and use `POST /admin/flights` to create a CAI → LHR flight
   departing more than 24 hours from now. Copy its ID.
3. Sign in as the seeded traveler and reserve an economy seat with `POST /bookings`.
   Copy the six-character booking reference.
4. Pay with `{"token":"tok_declined"}` and an unused `Idempotency-Key`. The response shows
   `insufficient_funds`, and the original hold remains usable. Send `{"token":"tok_success"}`
   with a new key to confirm. Repeat that successful request and key to replay its result.
5. Open the receipt, cancel the booking, and open the receipt again to see the full refund.
6. For recovery, reserve a fresh seat and use `tok_timeout` and a new key. The response is 202.
   The recovery job runs every minute and picks up payment attempts after five minutes. Reopen
   the receipt to see the result. If the hold expired first, the receipt shows a refund.

Swagger supplies the CSRF header. In Postman, keep the session cookie and send
`X-Requested-With: postman` with write requests.

## Architecture and individual questions

- **Where is Adapter?** `PayForBooking`, `RecoverPayments`, and `RefundPayments` depend on
  `PaymentGateway`. The mock stores charge outcomes independently so lookup can recover them
  after a restart. The refund ID is the gateway's idempotency key.
- **What commits together?** The payment attempt commits before the gateway call. A separate
  transaction settles the charge, confirms the booking and commits the hold, or records the
  refund if confirmation is impossible. Booking cancellation records its refund in the same
  transaction that releases the seat. Gateway refund calls happen after commit. Recovery
  claims due rows with expiring leases so multiple workers can run safely.

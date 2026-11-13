# Payments Beta

| Story     | Behavior                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-PAY-01 | A traveler pays their own pending booking. Booking checks the hold and supplies the saved fare. Successful payment, booking confirmation and seat commitment share one transaction.          |
| US-PAY-03 | The same payer and key replay the same payment attempt. A PostgreSQL partial unique index allows only one pending or successful attempt per booking, including requests with different keys. |

## M2 demo in Swagger

1. From the repository root, run `pnpm install`, `pnpm bootstrap` and `pnpm --filter api dev`.
   Open <http://localhost:3001/docs>. Bootstrap prints the two local accounts.
2. Sign in as the admin and create a fresh CAI → LHR flight with seats through
   `POST /admin/flights`. Copy the returned flight ID. The existing seeded schedule has fares,
   so create the flight through Administration to provision its inventory as well.
3. Sign in as the traveler. Execute `POST /bookings` with the new `flightId` and
   `"cabin": "ECONOMY"`. Copy the six-character `reference`. The booking has status
   `PENDING_PAYMENT` and a saved amount in minor units.
4. Execute `POST /bookings/{reference}/payments` with `Idempotency-Key: m2-pay-1` and body
   `{"token":"tok_success"}`. Expect 201, `SUCCEEDED`, the booking's amount, and VISA •••• 4242.
   Use a new key for each fresh booking. In Postman, keep the session cookie and send
   `X-Requested-With: postman` on writes. Swagger adds that header.
5. Send the same request and key again. The payment ID and response match. Send a different key
   for the paid booking and expect `409 ALREADY_PAID`.
6. `GET /bookings/{reference}` shows `CONFIRMED`. `GET /notifications` shows the confirmation.
   If the admin delays this flight, the traveler also receives the flight delay notification.

## Individual questions

- **Where is Adapter?** `PaymentGateway` is the interface `PayForBooking` calls.
  `MockGatewayAdapter` converts the demo tokens into gateway outcomes. Nest injects it through
  `PAYMENT_GATEWAY`. Another adapter can use the same port.
- **Why are there two transaction boundaries?** PostgreSQL commits a unique pending attempt
  before the provider call. The provider receives the payment ID as its key. A separate short
  transaction saves success, confirms Booking and commits the Inventory hold. Notifications
  receives the event after that transaction commits.

The Booking dependency supports one adult on one flight for checkout. Receipt retrieval, booking
cancellation refunds, and automatic recovery are Final stories. A timeout or interrupted
settlement can leave the attempt pending. Its key remains reserved and a second charge is blocked.

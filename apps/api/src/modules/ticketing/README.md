# Ticketing

The Administration manifest uses `FlightTickets.forFlight(tx, flightId)` to look up ticket
numbers and statuses. Ticketing issues one ticket for each confirmed booking in the current
single-passenger flow inside the confirmation transaction. It emits `TicketsIssued` after commit. It voids the ticket in the
booking cancellation transaction, alongside the seat release and refund record.

Only Ticketing owns the `tickets` table. Booking supplies the booking ID and flight ID through a transaction event. The migration backfills tickets for existing confirmed bookings.

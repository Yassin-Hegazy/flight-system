# Ticketing

One valid ticket per passenger per flight, issued once (US-TK-01 to 04, NFR-REL-02).

## How a ticket comes to exist

1. Payment confirms a booking, and Booking publishes `BookingConfirmed` after the commit.
2. `IssueTickets` (after commit) checks, in this order: the booking exists, it has no tickets yet,
   it is CONFIRMED. Then one transaction marks the booking TICKETED through Booking's
   `markTicketed` and inserts the tickets. `TicketsIssued` is published after that commit.
3. If issuance fails, the booking stays CONFIRMED. `TicketRepairJob` runs every five minutes and
   issues any booking still CONFIRMED.
4. Cancelling a booking voids its tickets inside the cancellation's transaction (`VoidTickets`),
   so a cancelled booking never keeps a valid ticket, even briefly.

Issuance is safe to repeat: it returns existing tickets, a run that loses a race returns the
winner's tickets, and the unique key on (booking, passenger, segment) is the last line of defence.

## Ticket numbers

13 digits: the prefix `999`, then a 10-digit value from the `ticket_number_seq` sequence. A
sequence never repeats a value, even after a rollback, so a voided number is never reused.

## Design pattern: Factory Method (lecture roles)

| Lecture role    | Here                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| IProduct        | `Ticket` (`ticket.ts`)                                                     |
| ConcreteProduct | `ETicket`: validates its 13-digit number, starts VALID                     |
| Creator         | `TicketCreator`: `forBooking` is SomeOperation, `createTicket` is abstract |
| ConcreteCreator | `ETicketCreator`: overrides `createTicket` to build an `ETicket`           |

`forBooking` holds the rules every kind of ticket shares: only a CONFIRMED booking, one ticket per
passenger per segment (`draftsFor`), numbers from the injected generator. Which product to build
is the subclass's decision. The module wires `TicketCreator` to `ETicketCreator`, so callers depend
on the abstract Creator only.

## Routes (owner only; anyone else gets the same 404 as a missing ticket)

- `GET /bookings/{reference}/tickets`: the booking's tickets with each flight as it stands now
- `GET /tickets/{number}`: one ticket
- `GET /tickets/{number}/print`: the printable e-ticket; a void ticket has `voidMarking: "VOID"`

## Owns

The `tickets` table and `ticket_number_seq`. It reads bookings only through Booking's
`BookingTicketing` port and flights only through `CatalogApi`.

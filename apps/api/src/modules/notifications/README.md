# Notifications

**Owner:** @owner-notifications (placeholder)

**Purpose:** In-app notifications created from domain events.

## Public API

`index.ts` exports:

- `NotificationsModule`: registered in `app.module.ts` (already done).
- `NOTIFICATIONS_API` and the `NotificationsApi` interface (`inbox`, `markRead`, `markAllRead`, `ownerOf`) with the `InboxPage` and `NotificationView` types. These serve the inbox routes below; other modules have no reason to call them.

**Other modules never call Notifications. They publish domain events and Notifications listens** (Observer pattern). Notifications imports no other domain module, so it cannot create a dependency cycle.

### How to publish an event (Booking, Ticketing, Administration owners)

The event types live in `shared/events.ts`. Publish with `publishDomainEvent`, **after the database transaction that caused the event has committed** (a rolled-back booking must never be announced):

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { publishDomainEvent } from '../../shared/events';

// 1. commit the transaction, 2. then:
await publishDomainEvent(this.events, {
  type: 'BookingConfirmed',
  eventId: randomUUID(), // unique per occurrence; a repeated eventId is delivered only once
  bookingId,
  ownerId, // the user to tell
  ref, // the public booking reference
});
```

`EventEmitter2` is injectable everywhere because `EventEmitterModule.forRoot()` is global in `app.module.ts`. `publishDomainEvent` never throws because of an observer: Notifications catches and logs its own failures.

| Event              | Published by   | Who is told                                       |
| ------------------ | -------------- | ------------------------------------------------- |
| `BookingConfirmed` | Booking        | `ownerId`                                         |
| `TicketsIssued`    | Ticketing      | `ownerId`                                         |
| `BookingExpired`   | Booking        | `ownerId`                                         |
| `BookingCancelled` | Booking        | `ownerId`, unless `reason` is `'AIRLINE'` (below) |
| `FlightDelayed`    | Administration | every id in `affectedUserIds`                     |
| `FlightCancelled`  | Administration | every id in `affectedUserIds`                     |

- For flight events the publisher puts the owners of the flight's **active** bookings (not expired or cancelled) in `affectedUserIds`, and the departure airport's IANA time zone in `departureTimeZone`, so delay messages show local time. Notifications never queries Booking.
- An airline cancellation publishes one `FlightCancelled` and one `BookingCancelled` (`reason: 'AIRLINE'`) per booking. Only `FlightCancelled` produces a message, so each traveler is told once.

### HTTP routes

All routes need a signed-in user and only ever touch the caller's own notifications.

| Route                           | Story    | Result                                                                             |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `GET /notifications?page=1`     | US-NT-04 | `{ items, unread, total, page, pageSize }`, newest first, 20 per page              |
| `PATCH /notifications/:id/read` | US-NT-03 | 204. Another user's (or an unknown) ID is a 404 with the same body, for admins too |
| `POST /notifications/read-all`  | US-NT-05 | `{ updated }`, the number of notifications changed                                 |

## Design

- **Observer** (`notification-event.handler.ts`): subscribes to every event type that has a template, when the module starts.
- **Declarative** (`notification-templates.ts`): a table from event type to message. Adding a row observes a new event.
- **Imperative** (`notification-event.handler.ts`): map, fan out per recipient, store, push outward.
- **Adapter** (`notification-channel.ts`): the interface the email/SMS gateway sits behind. `SimulatedGatewayChannel` is the simulated gateway; a real one is another `NotificationChannel`. Delivery is started without waiting and its failures are logged and dropped, so a broken or slow gateway never delays or undoes a booking or status change.
- **Repository** (`notifications.repository.ts`): `PgNotificationsRepository` is the only file with SQL. The unique `(eventId, userId)` key makes a repeated event a no-op.
- **Guards** (`notifications.controller.ts`): routes use `secure()` from Users and Access, so ownership is enforced on the server.

## Scope

Beta: US-NT-01, US-NT-04 (this module's beta stories), plus US-NT-02 (flight status, the core of milestone 1 FR 5), US-NT-03, US-NT-05 and the gateway Adapter (milestone 1 NFR 5).

Not yet built: US-NT-06 (departure reminder job) and US-NT-07 (email opt-in per type). Both need data from other modules and are planned for the final version.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

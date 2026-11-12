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

| Route                                  | Story    | Result                                                                             |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `GET /notifications?page=1`            | US-NT-04 | `{ items, unread, total, page, pageSize }`, newest first, 20 per page              |
| `PATCH /notifications/:id/read`        | US-NT-03 | 204. Another user's (or an unknown) ID is a 404 with the same body, for admins too |
| `POST /notifications/read-all`         | US-NT-05 | `{ updated }`, the number of notifications changed                                 |
| `GET /notifications/preferences`       | US-NT-07 | `{ preferences: [{ type, email }] }`, every type, email off until the user opts in |
| `PUT /notifications/preferences/:type` | US-NT-07 | 204. Body `{ "email": true \| false }`. An unknown type is a 404                   |

### Integration points (what other modules still need to provide)

Notifications imports nothing from other domain modules. Where it needs something back, it defines a **port** (an interface plus an injection token, exported from `index.ts`) with a do-nothing default, so the feature stays quiet until the owning module wires a real one. Each is a one-line change in `notifications.module.ts`: replace the default `useClass` with an adapter over the other module's API.

| Port               | Provided by                        | Used for                                                 | Until it exists       |
| ------------------ | ---------------------------------- | -------------------------------------------------------- | --------------------- |
| domain events      | Booking, Ticketing, Administration | every notification above                                 | inboxes stay empty    |
| `DEPARTURE_SOURCE` | Booking                            | the reminder job: bookings with their flight's departure | no reminders are sent |
| `EMAIL_DIRECTORY`  | Users and Access                   | email: the address for a user ID                         | no email is sent      |

- `DepartureSource.ticketedDeparturesBetween(from, to)` returns bookings (any status) whose flight departs in that range, as `UpcomingDeparture` objects carrying the booking and flight status. Notifications decides whom to remind.
- `EmailDirectory.emailOf(userId)` returns the user's address, or `null`.

## Design

- **Observer** (`notification-event.handler.ts`): subscribes to every event type that has a template, when the module starts.
- **Declarative** (`notification-templates.ts`): a table from event type to message. Adding a row observes a new event.
- **Imperative** (`notification-event.handler.ts`): map, fan out per recipient, store, push outward.
- **Adapter** (`notification-channel.ts`): the interface every way out of the app sits behind. `EmailChannel` is the only channel today; another is one more `NotificationChannel`. Delivery is started without waiting and its failures are logged and dropped, so a broken or slow channel never delays or undoes a booking or status change.
- **Adapter for mail** (`mail.ts`): how an email leaves. `LocalMailCatcher` keeps the latest 100 messages in memory and sends nothing; a real SMTP transport would be another `MailTransport`.
- **Ports** (`departure-source.ts`, `email-directory.ts`): dependency inversion. Notifications owns the interface and other modules implement it, so Notifications never imports them.
- **Scheduled job** (`departure-reminder.job.ts`): runs every 10 minutes through `@nestjs/schedule`. The reminder rule lives in `departure-reminder.service.ts`.
- **Repository** (`notifications.repository.ts`, `preferences.repository.ts`): the `Pg...` classes are the only files with SQL. The unique `(eventId, userId)` key makes a repeated event, or a repeated reminder, a no-op.
- **Guards** (`notifications.controller.ts`): routes use `secure()` from Users and Access, so ownership is enforced on the server.

## Reminders and email

- **Reminder** (US-NT-06): a booking whose status is `TICKETED` and whose flight is not `CANCELLED` is reminded when the flight is 23 to 24 hours away (both ends inclusive). Its reminder ID is `reminder:<bookingId>`, so each booking is reminded once however often, or however many times at once, the job runs (NFR-REL-02).
- **Email** (US-NT-07): off by default. A traveler opts in per notification type. The email carries exactly the in-app title and text. If the address is unknown or the transport fails, the in-app notification is unaffected.

## Scope

All seven stories are built: US-NT-01 to US-NT-07, with the gateway Adapter (milestone 1 NFR 5).

What works end to end today is everything that only needs this module and the database. Reminders and email stay quiet in a running app until Booking provides `DEPARTURE_SOURCE` and Users and Access provides `EMAIL_DIRECTORY`; both are covered by tests that supply stand-ins for them. NFR-USAB-01 (a keyboard-accessible inbox, checked with axe) needs the web inbox, which is not built yet.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

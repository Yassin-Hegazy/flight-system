# Users Access

**Owner:** @owner-users-access (placeholder)

**Purpose:** Accounts, sign-in, roles and access guards.

## Public API

Other modules use two things from `index.ts`:

- `USERS_API` / `UsersApi`: register, sign in and out, resolve the current user, profile, password
  and saved travelers. Expected failures are `Result` error codes.
- The access decorators (Decorator pattern, S1 sections 6 and 7), written as the lecture writes
  the pattern:

  | Lecture role        | Here                                                      |
  | ------------------- | --------------------------------------------------------- |
  | `IComponent`        | `UseCase<I, O>`, with one method `execute(ctx, input)`    |
  | `ConcreteComponent` | `Action`, or any class of yours that implements `UseCase` |
  | `Decorator`         | `UseCaseDecorator`: holds a component and delegates to it |
  | `ConcreteDecorator` | `WithAuth`, `WithRole`, `WithOwnership`: one check each   |

  A decorator has the interface of the component it wraps, so decorators stack:

```ts
// Read: the owner, or an administrator (adminMayRead). Act: the owner only.
const view = new WithAuth(new WithOwnership(getBooking, bookings.ownerOf, { adminMayRead: true }));
const cancel = new WithAuth(new WithOwnership(cancelBooking, bookings.ownerOf));
const createFlight = new WithAuth(new WithRole(createFlightCommand, UserRole.Admin));

await cancel.execute(ctx, { ref });
```

In a controller, `@Ctx()` gives the request's `RequestContext`; pass it to `execute`. Inside a use
case, `signedIn(ctx)` returns the signed-in user.
Someone else's record and a missing record get the same 404, so a response never confirms that
another user's record exists.

## How a request is checked

1. `CsrfMiddleware`: POST, PUT, PATCH and DELETE must carry `X-Requested-With`, or get 403
   `CSRF_CHECK_FAILED`. The web app must set this header on every request it sends. Swagger UI at
   `/docs` sets it for you; in Postman, add `X-Requested-With: postman` to the collection headers.
2. `PrincipalMiddleware`: resolves who is signed in from the server-side session and renews the
   cookie. It never rejects a request.
3. The decorators around the use case: 401 when not signed in, 403 for the wrong role, 404 when the
   record is not the caller's.

Sessions are random tokens stored only as SHA-256 hashes, sent in an HttpOnly, SameSite=Lax cookie
that lives 24 hours from the last request. Passwords are stored only as argon2id hashes. Five
failed sign-ins within 15 minutes lock that email for 15 minutes from the fifth.

`test/route-access.int-spec.ts` lists every route with its access level. A new route must be added
there, or CI fails.

## First administrator

Nobody can register as an administrator. Create the first one with
`ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm db:seed:admin`; after that, administrators create others
through `POST /users/admins`.

## Module rules

1. `index.ts` is this module's public API. It is the only file that code outside this folder may import.
2. Everything else inside this folder (services, controllers, entities, subfolders, tests) is the owner's choice.
3. This module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`) to another module's entities. A reference to another module's data is a plain ID column.
4. `app.module.ts` imports this module only through `index.ts`.

Rules 1 and 4 are enforced by `pnpm depcruise`. Rule 3 is enforced indirectly: another module's entities are not exported from its `index.ts`, so they cannot be imported.

Entity files must be named `*.entity.ts` so that the migration CLI can find them.

# Flight Search, Booking and Ticketing System

A university team project, built as a modular monolith:

- `apps/api`: one NestJS backend that contains every domain module.
- `apps/web`: one Next.js frontend.
- One PostgreSQL database.

This repository is currently a scaffold. It contains no business logic and no database schema yet.

## Prerequisites

| Tool    | Version                                      | Notes                                                               |
| ------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Node.js | 24 LTS, 24.15.0 or later (see `.nvmrc`)      | `nvm use` or `fnm use` selects the pinned version.                  |
| pnpm    | 12 (pinned in `package.json`)                | Install with `npm install -g pnpm@12` or `corepack enable`.         |
| Docker  | Docker Desktop or Docker Engine with Compose | Runs the local database and the integration tests (Testcontainers). |

## Setup from a fresh clone

```sh
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

On Windows PowerShell, use `Copy-Item` in place of `cp`.

Then open:

- <http://localhost:3000>: the web app. It shows the API health, which should read "Database connected".
- <http://localhost:3001/docs>: the API documentation (Swagger UI).

To run the Playwright tests for the first time, install the browsers once:

```sh
pnpm --filter web exec playwright install chromium firefox
```

## Scripts

Run every script from the repository root.

| Script                       | What it does                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Starts both apps in watch mode: web on port 3000, API on port 3001.                                                                                                   |
| `pnpm build`                 | Builds both apps for production.                                                                                                                                      |
| `pnpm typecheck`             | Type-checks both apps with TypeScript. Requires `apps/web/.env`, because Next.js reads `API_URL`.                                                                     |
| `pnpm lint`                  | Runs ESLint on the whole repository. `pnpm lint:fix` also applies automatic fixes.                                                                                    |
| `pnpm format`                | Formats the whole repository with Prettier. `pnpm format:check` only reports differences.                                                                             |
| `pnpm depcruise`             | Checks the architecture rules (see [Module rules](#module-rules)) with dependency-cruiser.                                                                            |
| `pnpm test`                  | Runs the API unit tests (`*.spec.ts` under `apps/api/src`) with coverage.                                                                                             |
| `pnpm test:integration`      | Runs the API integration tests (`apps/api/test/**/*.int-spec.ts`) against a PostgreSQL container started by Testcontainers. Docker must be running.                   |
| `pnpm test:e2e`              | Runs the Playwright tests in Chromium and Firefox. Starts both apps if they are not already running; the database must be running.                                    |
| `pnpm db:migration:generate` | Generates a migration from the difference between the entities and the database. Pass the path, e.g. `pnpm db:migration:generate src/database/migrations/AddFlights`. |
| `pnpm db:migration:create`   | Creates an empty migration. Pass the path, e.g. `pnpm db:migration:create src/database/migrations/SeedAirports`.                                                      |
| `pnpm db:migrate`            | Applies all pending migrations.                                                                                                                                       |
| `pnpm db:migrate:revert`     | Reverts the most recently applied migration.                                                                                                                          |

Migration paths are relative to `apps/api`. The `db:*` scripts build the API first and run the TypeORM CLI against the compiled output, using the connection in `apps/api/.env`. The application never changes the schema itself (`synchronize` is off), so every schema change needs a migration.

A pre-commit hook (Husky and lint-staged) formats and lints the staged files on every commit.

## Repository layout

```text
apps/
  api/                 NestJS backend (the monolith)
    src/
      main.ts          Bootstrap: logger, Swagger at /docs
      app.module.ts    Root module; imports each domain module through its index.ts
      config/          Environment validation and logging
      health/          GET /health
      database/        TypeORM configuration, CLI DataSource and migrations/
      shared/          Framework-level helpers only (see shared/README.md)
      modules/         The nine domain modules
    test/              Integration tests and the Testcontainers helper
  web/                 Next.js frontend
    app/               App Router pages, layout and providers
    e2e/               Playwright tests
.github/               CI workflow and CODEOWNERS
docker-compose.yml     Local PostgreSQL 18
.dependency-cruiser.cjs  Architecture rules
```

## Modules

Each module lives in `apps/api/src/modules/<name>/` and has its own README. Owners are placeholders until the team assigns them (see `.github/CODEOWNERS`).

| Module           | Owner                   | Purpose                                                   |
| ---------------- | ----------------------- | --------------------------------------------------------- |
| `flight-catalog` | `@owner-flight-catalog` | Flights, airports, schedules and operational status.      |
| `search`         | `@owner-search`         | Flight search and comparison.                             |
| `inventory`      | `@owner-inventory`      | Cabin capacity, seat holds and availability.              |
| `booking`        | `@owner-booking`        | Bookings, passengers and the booking lifecycle.           |
| `ticketing`      | `@owner-ticketing`      | Ticket issuance and retrieval.                            |
| `notifications`  | `@owner-notifications`  | In-app notifications created from domain events.          |
| `users-access`   | `@owner-users-access`   | Accounts, sign-in, roles and access guards.               |
| `administration` | `@owner-administration` | Administrative operations on flights, capacity and fares. |
| `payments`       | `@owner-payments`       | Simulated payments and refunds.                           |

Everything outside the modules is owned by `@owner-lead`.

## Module rules

These are the only constraints on module owners.

1. `index.ts` is a module's public API. It is the only file that code outside the module folder may import.
2. Everything else inside a module folder is the owner's choice.
3. Each module registers only its own entities, using `TypeOrmModule.forFeature()`. Entities must never have TypeORM relations to another module's entities; a cross-module reference is a plain ID column.
4. `app.module.ts` imports each module only through its `index.ts`.

`pnpm depcruise` enforces the following, and CI runs it on every pull request:

- A file in `modules/X` may import from `modules/Y` only through `modules/Y/index.ts`.
- Code outside `modules/` may import a module only through its `index.ts`.
- Modules may not depend on each other in a cycle.
- `shared/` may not import from `modules/`.
- `apps/web` may not import from `apps/api`.

Rule 3 is enforced indirectly: a module's entities are not exported from its `index.ts`, so no other module can import them to declare a relation.

Two conventions follow from the tooling:

- Entity files must be named `*.entity.ts`, so that the migration CLI can find them.
- Unit tests must be named `*.spec.ts`. They may be placed anywhere under `apps/api/src`.

## Configuration

Each app reads its settings from a `.env` file, copied from the committed `.env.example`. Real `.env` files are not committed.

- `apps/api/.env`: `NODE_ENV`, `PORT`, `DATABASE_URL` and `LOG_LEVEL`. The API validates them at startup and stops with a list of errors if any is missing or invalid.
- `apps/web/.env`: `API_URL`, the address of the API. The web app forwards every request for `/api/*` to this address, so the browser only talks to one origin.

To use a hosted Neon database instead of Docker, set `DATABASE_URL` to the connection string from the Neon console.

## Logging

The API logs JSON through pino (formatted for reading when `NODE_ENV=development`). Each request gets a request ID, taken from a valid incoming `x-request-id` header or generated. The ID is returned in the `x-request-id` response header and included as `reqId` on every log line written while the request is handled.

# Bangladesh Tech Job Radar

A job discovery and aggregation backend focused on Bangladesh's technology job market. Job seekers currently have to check many scattered sources (government circulars, company career pages, university and NGO notices, portals); the long-term idea is one searchable place with every posting in a common shape, linked back to its source.

## Status

**Backend-focused demo (Day 1 foundation).** What exists today:

- A PostgreSQL schema (Neon) with Prisma migrations and four tables. Jobs carry a legacy `salary` text plus structured salary fields (see [API.md](API.md#salary)).
- Three read-only, public JSON endpoints: `GET /api/jobs`, `GET /api/jobs/{id}`, `GET /api/sources`.
- Email + password authentication with database-backed sessions: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (see [API.md](API.md#authentication)).
- Idempotent seed script with **25 synthetic demo jobs** and 5 demo sources. All records are demonstration data; every URL uses `example.com`. They are not real vacancies.
- HTTP integration tests and a Postman collection.

What does **not** exist: scraping or ingestion of real job sites, a frontend (the home page is the default Next.js starter), email verification, password reset, subscriptions or usage enforcement (`Usage` is unused; nothing restricts anything by plan), pagination, full-text search. See [Limitations](#current-limitations) and [Roadmap](#future-roadmap).

## Tech stack

Next.js 16 (App Router, Route Handlers), TypeScript, Zod 4, Prisma ORM 7 with the Neon driver adapter, PostgreSQL 18 on Neon, Node.js. Tests use the Node built-in test runner.

## Architecture

```
Client -> Route Handler -> Zod validation -> Prisma -> Neon PostgreSQL -> JSON response
```

Route handlers call Prisma directly; there are no service or repository layers. One shared Prisma client lives in `lib/prisma.ts`. The app connects at runtime through the pooled `DATABASE_URL`; the Prisma CLI (migrations) uses the direct `DIRECT_URL`.

The planned ingestion pipeline (Sources -> Collection -> Raw Content -> Extraction -> Normalization -> Validation -> Deduplication -> PostgreSQL) is a **future direction only**. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository structure

```
app/api/jobs/route.ts        GET /api/jobs (filters)
app/api/jobs/[id]/route.ts   GET /api/jobs/{id}
app/api/sources/route.ts     GET /api/sources
app/api/auth/*/route.ts      register, login, logout, me
lib/auth.ts                  scrypt hashing, sessions, cookie, Origin check
lib/prisma.ts                shared Prisma client (Neon adapter, DATABASE_URL)
lib/schemas.ts               Zod query schema
lib/log.ts                   safe error logging
prisma/schema.prisma         data model
prisma/migrations/           SQL migrations (committed)
prisma/seed.ts               demo seed data
prisma.config.ts             Prisma CLI config (DIRECT_URL, seed command)
tests/                       API and DB-failure tests
postman/                     Postman collection
ARCHITECTURE.md  DATABASE_DESIGN.md  API.md
```

`generated/prisma/` (the Prisma client) is generated locally and git-ignored.

## Prerequisites

- Node.js `^20.19`, `^22.12` or `>=24` (Prisma 7's requirement; Next.js itself needs >= 20.9) and npm.
- A Neon PostgreSQL database for **development**. Use a dev branch, not production.

## Setup

```bash
npm ci
cp .env.example .env          # Windows cmd: copy .env.example .env
```

Edit `.env` and set both variables from the Neon dashboard (Connect button):

| Variable | Used by | Value |
| --- | --- | --- |
| `DATABASE_URL` | app runtime, seed script | **pooled** connection string (host contains `-pooler`) |
| `DIRECT_URL` | Prisma CLI (`migrate`, `validate`, ...) | **direct** connection string (no `-pooler`) |

`.env` is git-ignored. Never commit real connection strings.

> **Warning: keep production credentials out of this project folder.**
>
> - Do not create `.env.production.local` with production database credentials in the local development project. Next.js automatically loads this file in production mode, including during local `next build` and `next start`.
> - Keep production credentials in the hosting provider's environment-variable settings.
> - Use a separate development Neon branch for local development and testing.

Then generate the client, apply migrations and seed:

```bash
npm run db:generate           # generates generated/prisma/ (required before dev/build/tsc)
npx prisma migrate deploy     # applies committed migrations (incl. add_structured_salary: additive, never resets)
npm run db:seed               # idempotent; safe to re-run
npm run dev                   # http://localhost:3000
```

Seeded salary figures are synthetic demonstration data, not verified employer information.

The seed only creates or updates its own demo rows (matched by `example.com` URLs) and never deletes anything. It refuses to run with `NODE_ENV=production`, but it cannot tell which database it points at, so check that `DATABASE_URL` is your development database.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` | ESLint |
| `npm run db:generate` | `prisma generate` |
| `npm run db:seed` | run `prisma/seed.ts` |
| `npm run test:api` | run `tests/*.test.mjs` |

Type-check with `npx tsc --noEmit`.

## Testing

Start the dev server (or `npm start` after a build) in one terminal, then:

```bash
npm run test:api                         # against http://localhost:3000
BASE_URL=http://localhost:3210 npm run test:api
```

`tests/auth.test.mjs` writes test users (`authtest-*@example.test`) to the dev database and removes only those. The other tests are read-only and assume the seeded dev database (25 jobs, 5 sources). `tests/schemas.test.mjs` is pure (no server or database). `tests/db-failure.test.mjs` additionally starts its own temporary dev server on port 3299 with an unreachable database URL, so it needs that port free. It is a development-mode test; running only `tests/api.test.mjs` is enough against a production server. See [API.md](API.md) for the Postman collection.

## Production build

```bash
npm run build
npm start
```

Provide `DATABASE_URL` (pooled) in the environment of the running server. Apply migrations separately with `npx prisma migrate deploy` using `DIRECT_URL`.

## API overview

Job and source endpoints are read-only and public; auth endpoints are listed below. Success: `{ "data": ... }`. Error: `{ "error": { "message": ..., "details"?: ... } }`.

| Endpoint | Description |
| --- | --- |
| `GET /api/jobs` | All jobs, newest first. Optional `keyword`, `location`, `category` filters. |
| `GET /api/jobs/{id}` | One job including its source. 400 for an invalid id, 404 if missing. |
| `GET /api/sources` | All sources, sorted by name. |
| `POST /api/auth/register` | Create account (email + password >= 12 chars), start session. 201 / 400 / 409. |
| `POST /api/auth/login` | Start a session. 200, or generic 401. |
| `POST /api/auth/logout` | End the current session; idempotent. |
| `GET /api/auth/me` | Current user, or 401. |

Full parameter and response reference: [API.md](API.md).

## Database overview

| Model | Purpose |
| --- | --- |
| `JobSource` | where jobs come from (`GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER`) |
| `Job` | a posting; belongs to one `JobSource` (`ON DELETE RESTRICT`); `deadline` and the structured salary fields are nullable; legacy `salary` text kept |
| `User` | account: unique `email`, nullable scrypt `passwordHash`, `subscriptionStatus` (not enforced yet) |
| `Session` | login session: SHA-256 `tokenHash` (unique), `expiresAt`; cascade-deleted with its user |
| `Usage` | placeholder for future per-user call tracking; belongs to a `User` |

Details and reference DDL: [DATABASE_DESIGN.md](DATABASE_DESIGN.md). The schema is managed only through Prisma migrations in `prisma/migrations/`.

## Current limitations

- Data is synthetic demo data; nothing scrapes or ingests real job sites.
- No pagination: `GET /api/jobs` returns every match.
- Salary filtering/sorting is not implemented; structured salary is returned, not queryable. There is no salary write endpoint yet, so `salarySchema` is exercised by the seed and tests only.
- `keyword` searches `title`, `organization` and `description` only. It does **not** search the `skills` array.
- Substring search uses `ILIKE` without an index (fine at this size).
- Authentication exists, but job endpoints are intentionally still public. No authorization, rate limiting, subscription or usage enforcement.
- No email verification and no password reset (no email delivery infrastructure yet).
- No frontend; `/` is the unmodified Next.js starter page.
- `Job.sourceUrl` is not unique, so there is no deduplication yet.
- Tests need a running server and the seeded development database; there is no CI.

## Future roadmap

Planned, not implemented: real ingestion from a few practical sources (collection, extraction, normalization, validation, basic deduplication), a minimal frontend with search and job details, a basic usage-restriction demo using `User`/`Usage`, pagination, and deployment. Further out: authentication, payments, OCR/AI extraction, full-text search, background workers. See [ARCHITECTURE.md](ARCHITECTURE.md).

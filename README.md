# Bangladesh Tech Job Radar

A job discovery and aggregation web app focused on Bangladesh's technology job market. Job seekers currently have to check many scattered sources (government circulars, company career pages, university and NGO notices, portals); the long-term idea is one searchable place with every posting in a common shape, linked back to its source.

## Status

**Full-stack demo (backend, auth, quotas and frontend complete).** What exists today:

- A Next.js frontend: job search with filters (`/`), job detail with Apply (`/jobs/[id]`), login and registration, a pricing page with live usage (`/pricing`), and the Scalar API reference (`/docs`, spec at `/openapi.json`).

- A PostgreSQL schema (Neon) with Prisma migrations and eight tables (`JobSource`, `Job`, `User`, `Session`, `Usage`, `JobView`, `ApplyClick`, `RateLimit`). Jobs carry a legacy `salary` text plus structured salary fields (see [API.md](API.md#salary)).
- Public JSON endpoints: `GET /api/jobs` (summary list/search, no `description`/`sourceUrl`) and `GET /api/sources`. `GET /api/jobs/{id}` (full detail) requires login and consumes the view quota.
- Email + password authentication with database-backed sessions: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (see [API.md](API.md#authentication)).
- Idempotent seed script with **25 synthetic demo jobs** and 5 demo sources. All records are demonstration data; every URL uses `example.com`. They are not real vacancies.
- HTTP integration tests and a Postman collection.

- FREE/PRO entitlements (`lib/entitlements.ts`) enforced server-side on `POST /api/jobs/{id}/view`, `POST /api/jobs/{id}/apply` and `GET /api/me/usage` (login required, lifetime quotas, row-lock concurrency protection).
- Database-backed rate limiting, Origin/CSRF checks, security headers and one error format (`{ error: { code, message } }`) across every endpoint (Phase 5 hardening).

What does **not** exist: scraping or ingestion of real job sites, email verification, password reset, **payments of any kind (production payment integration is not implemented; PRO can only be set directly in the database)**, pagination, full-text search. The code has not been deployed or tested against a production database. See [Limitations](#current-limitations) and [Roadmap](#future-roadmap).

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
app/page.tsx, app/jobs/, app/login/, app/register/, app/pricing/   frontend pages
app/docs/, app/openapi.json/  Scalar API reference + OpenAPI 3.1 spec (lib/openapi.ts)
components/                  UI components (jobs, auth, usage, layout)
lib/api-client.ts, lib/auth-context.tsx, lib/utils.ts   browser API client, session state, formatting
app/api/jobs/route.ts        GET /api/jobs (filters)
app/api/jobs/[id]/route.ts   GET /api/jobs/{id}
app/api/sources/route.ts     GET /api/sources
app/api/auth/*/route.ts      register, login, logout, me
app/api/jobs/[id]/view|apply  usage-tracking POSTs (app/api/me/usage: GET usage)
lib/auth.ts                  scrypt hashing, sessions, cookie, Origin check
lib/prisma.ts                shared Prisma client (Neon adapter, DATABASE_URL)
lib/schemas.ts               Zod schemas (query, salary, auth)
lib/entitlements.ts          FREE/PRO limits (pure functions)
lib/usage.ts                 view/apply guard, per-user row lock, usage counts
lib/rate-limit.ts            Postgres-backed rate limiter (HMAC pseudonyms)
lib/api-error.ts             the single error response shape
lib/log.ts                   safe error logging
prisma/schema.prisma         data model
prisma/migrations/           SQL migrations (committed)
prisma/seed.ts               demo seed data
prisma.config.ts             Prisma CLI config (DIRECT_URL, seed command)
tests/                       API, auth, usage/concurrency, security/rate-limit, DB-failure tests
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

Also set (see `.env.example`):

| Variable | Value |
| --- | --- |
| `RATE_LIMIT_SECRET` | **required**; random string of 32+ characters (`openssl rand -base64 48`), different per environment. Without it register/login/view/apply return 500. |
| `TRUSTED_IP_HEADER` | optional; the header your hosting proxy overwrites with the client IP (Vercel: `x-real-ip`). Leave unset if unsure: all clients then share one rate-limit bucket. For local tests set `x-forwarded-for`. |

`.env` is git-ignored. Never commit real connection strings or secrets.

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

Tests need a dev server started with `RATE_LIMIT_SECRET` and `TRUSTED_IP_HEADER=x-forwarded-for` in `.env` (each test request sends its own fake IP so the per-IP limits do not interfere). A fixed rate-limit window can roll over mid-test; the tests wait on the database clock when fewer than 20 s are left. `tests/auth.test.mjs`, `usage.test.mjs` and `security.test.mjs` write test users (`authtest-*`, `usagetest-*`, `sectest-*@example.test`) and rate-limit rows to the **development** database and remove only those; `tests/security.test.mjs` takes about a minute. Set `NEXT_DIST_DIR=.next-verify` to run a second server beside one already on port 3000. The other tests are read-only and assume the seeded dev database (25 jobs, 5 sources). `tests/schemas.test.mjs` is pure (no server or database). `tests/db-failure.test.mjs` additionally starts its own temporary dev server on port 3299 with an unreachable database URL, so it needs that port free. It is a development-mode test; running only `tests/api.test.mjs` is enough against a production server. See [API.md](API.md) for the Postman collection.

## Production build

```bash
npm run build
npm start
```

`npm run build` runs `prisma generate` first (the client in `generated/` is git-ignored), so a fresh clone or a Vercel build needs no extra step. The build needs `DATABASE_URL` to be set (it does not connect); the running server needs `DATABASE_URL` (pooled), `RATE_LIMIT_SECRET` (32+ characters, different per environment) and, behind a trusted proxy, `TRUSTED_IP_HEADER` (on Vercel: `x-real-ip`). Apply migrations separately, from your machine, with `npx prisma migrate deploy` and the production `DIRECT_URL` set in that shell only.

## API overview

Job and source endpoints are read-only and public; auth endpoints are listed below. Success: `{ "data": ... }` (usage endpoints add `success: true`). Error: `{ "error": { "code": ..., "message": ..., "details"?: ... } }`.

| Endpoint | Description |
| --- | --- |
| `GET /api/jobs` | All jobs, newest first. Optional `keyword`, `location`, `category` filters. |
| `GET /api/jobs/{id}` | Full job incl. description, source URL and source (login). FREE: 10 unique jobs, re-viewing is free, 429 `VIEW_LIMIT_REACHED` for an 11th new job; PRO unlimited. 401 / 400 / 404 otherwise. |
| `GET /api/sources` | All sources, sorted by name. |
| `POST /api/auth/register` | Create account (email + password >= 12 chars), start session. 201 / 400 / 409 / 429. |
| `POST /api/auth/login` | Start a session. 200, or generic 401. |
| `POST /api/auth/logout` | End the current session; idempotent. |
| `GET /api/auth/me` | Current user, or 401. |
| `POST /api/jobs/{id}/view` | Record a unique job view (login). 429 at the FREE limit. |
| `POST /api/jobs/{id}/apply` | Record an Apply click, return the source URL (login). |
| `GET /api/me/usage` | Your usage and remaining quota (login). |

Full parameter and response reference: [API.md](API.md).

## Database overview

| Model | Purpose |
| --- | --- |
| `JobSource` | where jobs come from (`GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER`) |
| `Job` | a posting; belongs to one `JobSource` (`ON DELETE RESTRICT`); `deadline` and the structured salary fields are nullable; legacy `salary` text kept |
| `User` | account: unique `email`, nullable scrypt `passwordHash`, `subscriptionStatus` (`FREE` default; rules in `lib/entitlements.ts`, enforced by the usage endpoints) |
| `Session` | login session: SHA-256 `tokenHash` (unique), `expiresAt`; cascade-deleted with its user |
| `Usage` | unused generic log table; belongs to a `User` |
| `JobView` / `ApplyClick` | unique job views (one per user and job) / one row per Apply click |
| `RateLimit` | fixed-window rate-limit counters keyed by HMAC pseudonym |

Details and reference DDL: [DATABASE_DESIGN.md](DATABASE_DESIGN.md). The schema is managed only through Prisma migrations in `prisma/migrations/`.

## Subscription rules (Phase 3)

| | FREE (default) | PRO |
|---|---|---|
| Job listing and search | unlimited | unlimited |
| Unique job-detail views | **10** per account | unlimited |
| Apply clicks | **3** per account | unlimited |

Limits are lifetime per account; no daily or monthly reset is defined. A *unique job view* means viewing the same job again costs nothing. An *Apply click* is its own event, counted separately. `lib/entitlements.ts` evaluates these rules from a trusted status and usage counts. Phase 4 enforces them server-side via `POST /api/jobs/{id}/view`, `POST /api/jobs/{id}/apply` and `GET /api/me/usage` (login required; row-lock concurrency protection, see [API.md](API.md#usage-tracking-phase-4)). `GET /api/jobs` stays public and unmetered (summaries only); `GET /api/jobs/{id}` requires login and counts a unique view (same quota as `POST /api/jobs/{id}/view`); Apply clicks are tracked separately. There is no payment processing; PRO can only be set directly in the database. Details: [ARCHITECTURE.md](ARCHITECTURE.md#subscription-entitlements-phase-3).

## Current limitations

- Data is synthetic demo data; nothing scrapes or ingests real job sites.
- No pagination: `GET /api/jobs` returns every match.
- Salary filtering/sorting is not implemented; structured salary is returned, not queryable. There is no salary write endpoint yet, so `salarySchema` is exercised by the seed and tests only.
- `keyword` searches `title`, `organization` and `description` only. It does **not** search the `skills` array.
- Substring search uses `ILIKE` without an index (fine at this size).
- The job list is intentionally public but returns summaries only. Full detail (`GET /api/jobs/{id}`) is login-gated and view-metered; `sourceUrl` is also returned by the Apply endpoint. See the limitations in [API.md](API.md).
- Rate limiting is per IP / email / user in Postgres; there is no CAPTCHA, account lockout or WAF, and the IP bucket is only as trustworthy as `TRUSTED_IP_HEADER`.
- No email verification and no password reset (no email delivery infrastructure yet).
- The frontend is a first version (search, job detail, auth, pricing, Scalar docs at `/docs`); no payments, so PRO cannot be bought.
- `Job.sourceUrl` is not unique, so there is no deduplication yet.
- Tests need a running server and the seeded development database; there is no CI.

## Future roadmap

Planned, not implemented: real ingestion from a few practical sources (collection, extraction, normalization, validation, basic deduplication), pagination, email verification and password reset. Further out: payments, OCR/AI extraction, full-text search, background workers. See [ARCHITECTURE.md](ARCHITECTURE.md).

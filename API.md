# API

JSON API. `GET /api/jobs` (summary list) and `GET /api/sources` are **public**. `GET /api/jobs/{id}` (full detail) **requires login**, and opening it **records a unique job-detail view** against the account's quota. The `/api/auth/*` endpoints are under [Authentication](#authentication); view, apply and usage endpoints are under [Usage tracking](#usage-tracking-phase-4). No pagination.

The same API is described as OpenAPI 3.1 at `/openapi.json` and rendered with Scalar at `/docs`; the two must agree.

Job objects carry both the legacy `salary` text and five structured salary fields; see [Salary](#salary).

## Running locally

```bash
npm ci
npm run dev            # http://localhost:3000, needs DATABASE_URL in .env (full setup: README.md)
```

## Tests

HTTP integration tests (Node built-in test runner, no extra dependencies). Start the dev server, then in another terminal:

```bash
npm run test:api                       # against http://localhost:3000
BASE_URL=http://localhost:3210 npm run test:api
```

They expect the seeded development database (25 jobs, 5 sources; `npx prisma db seed`). `tests/auth.test.mjs` creates users named `authtest-*@example.test` in that database and deletes only those afterwards (sessions cascade); it runs one SQL UPDATE (via `@neondatabase/serverless`, a dev dependency) to expire a session. `tests/usage.test.mjs` creates `usagetest-*@example.test` users (their JobView/ApplyClick rows cascade), briefly inserts one job titled `usagetest-bad-url`, and runs real simultaneous requests for the concurrency checks; `npm run test:api` uses `--test-concurrency=1` so test files never overlap. `tests/db-failure.test.mjs` also starts its own temporary dev server (port 3299, separate build dir) with an unreachable `DATABASE_URL` to check that failures return a generic 500 and log no credentials.

Postman: import `postman/BD Tech Job Radar.postman_collection.json` (File > Import), keep `baseUrl` = `http://localhost:3000`, and run the collection with the Collection Runner. Each request has test scripts.

## Conventions

- Success: `{ "data": ... }`
- Error (every endpoint): `{ "error": { "code": string, "message": string, "details"?: object } }`. `code` is stable and machine-readable; `message` is for humans and may change.
- 500 responses are always `{ "error": { "code": "INTERNAL_ERROR", "message": "Internal server error" }}`; the server log records only the error class and code (never messages, queries or connection details).
- Error codes: `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `INVALID_QUERY`, `INVALID_JOB_ID`, `JOB_NOT_FOUND`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `FORBIDDEN_ORIGIN`, `INVALID_SUBSCRIPTION`, `APPLY_URL_UNAVAILABLE`, `VIEW_LIMIT_REACHED`, `APPLY_LIMIT_REACHED`, `RATE_LIMITED`, `INTERNAL_ERROR`. Success envelopes differ by route: most return `{ "data": ... }`; `GET /api/me/usage` returns `{ "success": true, "data": ... }`; `POST /api/jobs/{id}/view` and `/apply` return top-level `{ "success": true, ... }` fields.

| Status | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Registered |
| 400 | Invalid query parameter, path id or request body |
| 413 | Auth request body over 10,000 characters |
| 422 | Job has no valid application URL (`APPLY_URL_UNAVAILABLE`) |
| 401 | Not authenticated / invalid credentials |
| 403 | Cross-origin request rejected (all state-changing POSTs); invalid stored plan |
| 404 | Job not found |
| 429 | FREE quota used up (`VIEW_LIMIT_REACHED`, `APPLY_LIMIT_REACHED`) or rate limit hit (`RATE_LIMITED`, with `Retry-After`) |
| 409 | Email already registered |
| 500 | Unexpected server error |

## GET /api/jobs

List jobs, newest first (`createdAt` desc). Returns all matches. **Public** (no login). The response is a *summary*: `description` and `sourceUrl` are **not** included; they come from `GET /api/jobs/{id}` (login + view quota) and `POST /api/jobs/{id}/apply`. `keyword` still searches `description` server-side.

Query parameters (all optional; each may appear at most once):

| Param | Max length | Match |
| --- | --- | --- |
| `keyword` | 100 | case-insensitive substring of `title`, `organization` or `description` |
| `location` | 100 | case-insensitive substring of `location` |
| `category` | 50 | case-insensitive exact match of `category` |

Values are trimmed; empty/whitespace-only values are ignored. A NUL character (`%00`) is rejected with 400. Filters combine with AND. Unknown parameters are ignored.

`keyword` does **not** search `skills` (e.g. `?keyword=kubernetes` returns no jobs even if a job lists Kubernetes as a skill). Matching is literal: `%`, `_` and `\` in a value are escaped, so `?keyword=%25` matches only text containing a percent sign, not everything.

```json
{
  "data": [
    {
      "id": 4,
      "title": "Backend Engineer",
      "organization": "Acme",
      "sector": "Private",
      "category": "Software",
      "location": "Dhaka",
      "salary": "Tk 70,000 - 110,000",
      "salaryMin": "70000",
      "salaryMax": "110000",
      "salaryCurrency": "BDT",
      "salaryPeriod": "MONTHLY",
      "salaryDisclosure": "DISCLOSED",
      "experience": "",
      "skills": [],
      "deadline": null,
      "sourceId": 3,
      "verified": false,
      "createdAt": "2026-11-04T10:00:00.000Z"
    }
  ]
}
```

Errors (400):

```json
{ "error": { "code": "INVALID_QUERY", "message": "Repeated query parameter(s) not allowed: keyword" } }
```
```json
{ "error": { "code": "INVALID_QUERY", "message": "Invalid query parameters", "details": { "keyword": ["Too big: expected string to have <=100 characters"] } } }
```

## GET /api/jobs/{id}

**Login required** (`bdr_session` cookie). Returns the full job (including `description`, `sourceUrl` and `source`) and counts as a *job-detail view* against the account's quota:

- FREE: 10 **unique** jobs per account, lifetime. Re-opening a job already viewed is free, even after the limit is reached.
- PRO: unlimited; views are still recorded.
- A new job after 10 unique views: 429 `VIEW_LIMIT_REACHED`, and no job data is returned.

Identity and plan come only from the session and the database; any `userId` / `subscriptionStatus` in the query, headers or body is ignored. It shares the quota, row lock and rate limit (60/min per user) with `POST /api/jobs/{id}/view`, so calling both for one job costs one view. Check order: 401, then 400, then 404, then the quota (429). Also 403 `INVALID_SUBSCRIPTION` (unknown stored plan, fails closed) and 500 `INTERNAL_ERROR`.

`id` must be a positive integer (no leading zeros, max 2147483647).

```json
{
  "data": {
    "id": 4,
    "title": "Backend Engineer",
    "...": "same job fields as the list",
    "source": { "id": 3, "name": "Acme Careers", "type": "COMPANY", "url": "https://example.com" }
  }
}
```

Errors:

```json
{ "error": { "code": "INVALID_JOB_ID", "message": "Invalid job id: must be a positive integer" } }
```
(400)
```json
{ "error": { "code": "JOB_NOT_FOUND", "message": "Job not found" } }
```
(404)

## Salary

Each job has two salary representations that coexist:

- `salary` (string): the **legacy free-text display string** (e.g. `"Tk 35,500 - 67,010 (Grade 9)"`). Unchanged, always present, may be empty.
- Five **structured** fields, all nullable:

| Field | Type | Notes |
| --- | --- | --- |
| `salaryMin`, `salaryMax` | decimal string or `null` | `DECIMAL(12,2)`. **Serialized as JSON strings** (e.g. `"70000"`, `"15.5"`) so no float rounding happens; use a decimal library, or `Number()` for display only. |
| `salaryCurrency` | `null` or 3 uppercase letters | `BDT`, `USD`, `EUR`, ... Not limited to BDT; the format is validated, the code list is not. |
| `salaryPeriod` | `MONTHLY` \| `YEARLY` \| `HOURLY` \| `null` | |
| `salaryDisclosure` | `DISCLOSED` \| `NEGOTIABLE` \| `NOT_DISCLOSED` \| `null` | `null` = legacy/unknown row: use the `salary` text. |

Rules (enforced by DB CHECK constraints and mirrored by `salarySchema` in `lib/schemas.ts`):

- Amounts are never negative; `salaryMin <= salaryMax` when both are set.
- `DISCLOSED` requires `salaryCurrency`, `salaryPeriod` and at least one of `salaryMin`/`salaryMax` (open-ended ranges are allowed).
- `NEGOTIABLE` and `NOT_DISCLOSED` must have no amounts and no currency.
- `null` disclosure requires every structured field to be `null`.

> **Demo data:** all seeded salaries are synthetic. BDT ranges are copied from the demo `salary` text (government "Grade N" labels are not amounts). USD/EUR, hourly, yearly, negotiable and not-disclosed rows are invented examples, and for those the seed also rewrites the legacy text so the two agree. Three jobs remain legacy rows (all structured fields `null`). None of it is verified employer information.

Example (`GET /api/jobs/{id}`, a remote job paid hourly in USD; other fields omitted):

```json
{ "data": { "salary": "USD 15 - 25 / hour (demo)", "salaryMin": "15", "salaryMax": "25",
  "salaryCurrency": "USD", "salaryPeriod": "HOURLY", "salaryDisclosure": "DISCLOSED" } }
```

Negotiable: `"salary": "Negotiable"`, amounts/currency/period `null`, `"salaryDisclosure": "NEGOTIABLE"`.
Legacy row: `"salary": "Tk 45,000 - 70,000"` with all five structured fields `null`.

## Authentication

Email + password with database-backed sessions. `/api/jobs` (summary list) and `/api/sources` stay public. `GET /api/jobs/{id}` (full detail) requires login and enforces the view quota; Apply is enforced by its own endpoint (see below).

**Session cookie.** Register and login set `bdr_session` (a 256-bit random token): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, expires after a **fixed 7 days** (no sliding renewal). The token is never returned in JSON. Only its SHA-256 is stored in the `Session` table. Send the cookie back on later requests (browsers do this automatically; with curl use `-c jar -b jar`).

**Safe user** (the only user shape ever returned): `{ "id", "email", "subscriptionStatus", "createdAt" }`. Never the password hash.

**Input.** JSON body. `email` is trimmed and lower-cased; it must be a valid address (max 254). `password` is 12-128 characters, used exactly as sent (not trimmed or case-folded). 400 responses carry `details` per field, e.g. `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body", "details": { "password": ["Password must be at least 12 characters"] } } }`. Malformed JSON is 400 `INVALID_JSON`; a body over 10,000 characters is 413 `PAYLOAD_TOO_LARGE`.

**Origin check (CSRF).** Every state-changing POST (register, login, logout, view, apply) rejects with 403 `FORBIDDEN_ORIGIN` a request whose `Origin` names a different host than `Host`, whose `Origin` is the opaque `null`, or that has no `Origin` but `Sec-Fetch-Site: cross-site`. A request with none of those headers (curl, Postman, server-to-server) is allowed: it is not a browser request carrying someone's ambient cookie. Combined with `SameSite=Lax`, a third-party page cannot make a logged-in browser call these endpoints.

**Rate limits** (shared across instances, stored in Postgres; exceeding returns 429 `RATE_LIMITED` plus a `Retry-After` header in seconds):

| Endpoint | Limit |
| --- | --- |
| `POST /api/auth/register` | 5 per hour per client IP |
| `POST /api/auth/login` | 20 per 15 min per client IP, and 10 per 15 min per target email (any IP) |
| `POST /api/jobs/{id}/view` | 60 per minute per authenticated user |
| `POST /api/jobs/{id}/apply` | 20 per minute per authenticated user |

Every attempt counts, successful or not. Public `GET` endpoints are not limited. The client IP comes only from the header named by the `TRUSTED_IP_HEADER` environment variable; when unset, all clients share one bucket. The per-email login limit means an attacker can temporarily block logins for a known email (the usual trade-off against password guessing).

### POST /api/auth/register

```bash
curl -i -c jar -X POST localhost:3000/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"a-secure-password"}'
```
201, sets `bdr_session`:
```json
{ "data": { "id": 7, "email": "user@example.com", "subscriptionStatus": "FREE", "createdAt": "2026-11-07T13:00:00.000Z" } }
```
409 `{ "error": { "code": "EMAIL_TAKEN", "message": "An account with this email already exists" } }` for a duplicate (case-insensitive).

### POST /api/auth/login

Same body. 200 with the same `data` shape and a **new** session cookie (existing sessions stay valid). Unknown email, wrong password and accounts without a password all return the same 401:
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password." } }
```

### POST /api/auth/logout

Deletes the session behind the cookie and clears it. Always 200, including when already logged out: `{ "data": { "loggedOut": true } }`. Other sessions of the same user are untouched.

### GET /api/auth/me

200 `{ "data": <safe user> }` for a valid session. 401 `{ "error": { "code": "UNAUTHENTICATED", "message": "Not authenticated" } }` for no cookie, unknown token or expired session (an expired session row is deleted when seen).

### Subscription status

`subscriptionStatus` is `"FREE"` or `"PRO"`. It always comes from the database row of the authenticated user. Every new account is `FREE`: register ignores any `subscriptionStatus` (or similar) field in the body, and login never modifies it. There is no endpoint to change it and no payment system, so a user cannot upgrade themselves. FREE allows 10 unique job-detail views and 3 Apply clicks per account; PRO is unlimited; listing and searching are unlimited for both. These limits are defined in `lib/entitlements.ts` and enforced by the usage endpoints below (Phase 4). Limits are lifetime per account; there is no daily or monthly reset.

### Limitations

- No email verification and no password reset: there is no email delivery infrastructure yet. A forgotten password cannot be recovered.
- Rate limits exist (above) but there is no account lockout, CAPTCHA or password-breach check.
- No "log out everywhere", no session listing, no password change.
- CSRF: `SameSite=Lax` plus the Origin / `Sec-Fetch-Site` check above; no CSRF token. A non-browser client can omit both headers, which is intended and carries no ambient cookie. The bundled frontend is same-origin, so no CORS is configured.
- Gating is partial by design: the public list returns summaries only (no `description`, `sourceUrl`), the detail endpoint enforces the view quota, and the Apply endpoint is the only way to get `sourceUrl` without opening the detail. The list is unmetered and still exposes title, organization, location, salary and skills, and `?keyword=` can probe `description` text (a hit/miss oracle, not the text itself). A FREE user can also open 10 details, then use Apply for `sourceUrl`s within the Apply quota; account sharing/scraping with many accounts is not prevented.
- Register reveals whether an email is taken (409). Login does not (generic 401, same hashing work either way).
- Plain HTTP in development: the cookie is not `Secure` outside production.

## Usage tracking (Phase 4)

All three endpoints require the `bdr_session` cookie. Identity and plan always come from the session and the database: any `userId`, `subscriptionStatus` or URL in a request body is ignored. Successes are `{ "success": true, ... }` (shapes below). POSTs also apply the cross-origin check (403) and the per-user rate limit (429 `RATE_LIMITED`, distinct from the lifetime quota codes). No payment system exists, so a FREE user cannot upgrade.

### POST /api/jobs/{id}/view

Records a **unique** job-detail view: one per user per job. No body. Kept for compatibility: `GET /api/jobs/{id}` now records the view itself, so clients no longer need to call this first.

- 200 `{ "success": true, "viewed": true, "alreadyViewed": false }` on the first view; `alreadyViewed: true` for a repeat (nothing is consumed, and repeats stay allowed after the limit is reached).
- 429 `{ "error": { "code": "VIEW_LIMIT_REACHED", "message": "You have reached your free job-view limit." } }` for a new job when a FREE user already viewed 10.
- 400 `INVALID_JOB_ID`, 401 `UNAUTHENTICATED`, 404 `JOB_NOT_FOUND`, 403 `INVALID_SUBSCRIPTION` (stored plan is not FREE/PRO; fails closed), 500 `INTERNAL_ERROR`.

### POST /api/jobs/{id}/apply

Records one Apply click and returns the job's stored `sourceUrl`. Every success counts, including repeats for the same job. No body; a client-supplied URL is ignored.

- 200 `{ "success": true, "applyUrl": "https://...", "remaining": 2 }` (`remaining` is `null` for PRO).
- 429 `{ "error": { "code": "APPLY_LIMIT_REACHED", "message": "You have reached your free Apply-click limit." } }`; no event is stored.
- 422 `APPLY_URL_UNAVAILABLE` when `sourceUrl` is not an http(s) URL; no event is stored.
- 400, 401, 403, 404, 500 as above.

### GET /api/me/usage

```json
{ "success": true, "data": { "subscriptionStatus": "FREE",
  "jobViews":    { "used": 4, "limit": 10, "remaining": 6, "unlimited": false },
  "applyClicks": { "used": 1, "limit": 3,  "remaining": 2, "unlimited": false } } }
```

PRO: `limit` and `remaining` are `null`, `unlimited` is `true`. Counts are read from `JobView` / `ApplyClick` for the session user only.

### Concurrency

Each view/apply runs in a transaction that first locks the user's row (`SELECT ... FOR UPDATE`), so simultaneous requests from one account are serialized and the count, quota check and insert cannot interleave. `JobView` also has a unique `(userId, jobId)` index. See ARCHITECTURE.md.

## GET /api/sources

All job sources, sorted by `name` ascending. `type` is one of `GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER`. Empty table returns `{ "data": [] }`.

```json
{ "data": [ { "id": 3, "name": "Acme Careers", "type": "COMPANY", "url": "https://example.com" } ] }
```

# API

JSON API. Job and source endpoints are read-only and **public** (no authentication required); the four `/api/auth/*` endpoints are described under [Authentication](#authentication). No pagination.

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

They expect the seeded development database (25 jobs, 5 sources; `npx prisma db seed`). `tests/auth.test.mjs` creates users named `authtest-*@example.test` in that database and deletes only those afterwards (sessions cascade); it runs one SQL UPDATE (via `@neondatabase/serverless`, a dev dependency) to expire a session. `tests/db-failure.test.mjs` also starts its own temporary dev server (port 3299, separate build dir) with an unreachable `DATABASE_URL` to check that failures return a generic 500 and log no credentials.

Postman: import `postman/BD Tech Job Radar.postman_collection.json` (File > Import), keep `baseUrl` = `http://localhost:3000`, and run the collection with the Collection Runner. Each request has test scripts.

## Conventions

- Success: `{ "data": ... }`
- Error: `{ "error": { "message": string, "details"?: object } }`
- 500 responses are always `{ "error": { "message": "Internal server error" }}`; the server log records only the error class and code (never messages, queries or connection details).

| Status | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Registered |
| 400 | Invalid query parameter, path id or request body |
| 401 | Not authenticated / invalid credentials |
| 403 | Cross-origin request rejected (auth POSTs) |
| 404 | Job not found |
| 409 | Email already registered |
| 500 | Unexpected server error |

## GET /api/jobs

List jobs, newest first (`createdAt` desc). Returns all matches.

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
      "description": "builds APIs",
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
      "sourceUrl": "https://example.com/job/1",
      "verified": false,
      "createdAt": "2026-11-04T10:00:00.000Z"
    }
  ]
}
```

Errors (400):

```json
{ "error": { "message": "Repeated query parameter(s) not allowed: keyword" } }
```
```json
{ "error": { "message": "Invalid query parameters", "details": { "keyword": ["Too big: expected string to have <=100 characters"] } } }
```

## GET /api/jobs/{id}

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
{ "error": { "message": "Invalid job id: must be a positive integer" } }
```
(400)
```json
{ "error": { "message": "Job not found" } }
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

Email + password with database-backed sessions. Phase 2 establishes *authentication only*: `/api/jobs`, `/api/jobs/{id}` and `/api/sources` stay public, and nothing enforces plans or usage yet.

**Session cookie.** Register and login set `bdr_session` (a 256-bit random token): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, expires after a **fixed 7 days** (no sliding renewal). The token is never returned in JSON. Only its SHA-256 is stored in the `Session` table. Send the cookie back on later requests (browsers do this automatically; with curl use `-c jar -b jar`).

**Safe user** (the only user shape ever returned): `{ "id", "email", "subscriptionStatus", "createdAt" }`. Never the password hash.

**Input.** JSON body. `email` is trimmed and lower-cased; it must be a valid address (max 254). `password` is 12-128 characters, used exactly as sent (not trimmed or case-folded). 400 responses carry `details` per field, e.g. `{ "error": { "message": "Invalid request body", "details": { "password": ["Password must be at least 12 characters"] } } }`.

**Origin check.** The POST endpoints reject (403) a request whose `Origin` header names a different host than the one called. Requests with no `Origin` (curl, tests, server-to-server) are allowed.

### POST /api/auth/register

```bash
curl -i -c jar -X POST localhost:3000/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"a-secure-password"}'
```
201, sets `bdr_session`:
```json
{ "data": { "id": 7, "email": "user@example.com", "subscriptionStatus": "FREE", "createdAt": "2026-11-07T13:00:00.000Z" } }
```
409 `{ "error": { "message": "An account with this email already exists" } }` for a duplicate (case-insensitive).

### POST /api/auth/login

Same body. 200 with the same `data` shape and a **new** session cookie (existing sessions stay valid). Unknown email, wrong password and accounts without a password all return the same 401:
```json
{ "error": { "message": "Invalid email or password." } }
```

### POST /api/auth/logout

Deletes the session behind the cookie and clears it. Always 200, including when already logged out: `{ "data": { "loggedOut": true } }`. Other sessions of the same user are untouched.

### GET /api/auth/me

200 `{ "data": <safe user> }` for a valid session. 401 `{ "error": { "message": "Not authenticated" } }` for no cookie, unknown token or expired session (an expired session row is deleted when seen).

### Limitations

- No email verification and no password reset: there is no email delivery infrastructure yet. A forgotten password cannot be recovered.
- No rate limiting or lockout on login/register (needs shared state; later phase).
- No "log out everywhere", no session listing, no password change.
- CSRF: `SameSite=Lax` plus the Origin check above. Requests without an `Origin` header are not checked, and no CSRF token is used; acceptable while every state-changing endpoint takes a JSON body and no CORS is enabled. Revisit when a frontend and other mutating endpoints exist.
- Register reveals whether an email is taken (409). Login does not (generic 401, same hashing work either way).
- Plain HTTP in development: the cookie is not `Secure` outside production.

## GET /api/sources

All job sources, sorted by `name` ascending. `type` is one of `GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER`. Empty table returns `{ "data": [] }`.

```json
{ "data": [ { "id": 3, "name": "Acme Careers", "type": "COMPANY", "url": "https://example.com" } ] }
```

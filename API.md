# API

Read-only JSON API. No authentication, no pagination.

## Running locally

```bash
npm ci
npm run dev            # http://localhost:3000, needs DATABASE_URL in .env (full setup: README.md)
```

## Tests

Read-only HTTP integration tests (Node built-in test runner, no extra dependencies). Start the dev server, then in another terminal:

```bash
npm run test:api                       # against http://localhost:3000
BASE_URL=http://localhost:3210 npm run test:api
```

They expect the seeded development database (25 jobs, 5 sources; `npx prisma db seed`). `tests/db-failure.test.mjs` also starts its own temporary dev server (port 3299, separate build dir) with an unreachable `DATABASE_URL` to check that failures return a generic 500 and log no credentials.

Postman: import `postman/BD Tech Job Radar.postman_collection.json` (File > Import), keep `baseUrl` = `http://localhost:3000`, and run the collection with the Collection Runner. Each request has test scripts.

## Conventions

- Success: `{ "data": ... }`
- Error: `{ "error": { "message": string, "details"?: object } }`
- 500 responses are always `{ "error": { "message": "Internal server error" }}`; the server log records only the error class and code (never messages, queries or connection details).

| Status | Meaning |
| --- | --- |
| 200 | Success |
| 400 | Invalid query parameter or path id |
| 404 | Job not found |
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
      "salary": "",
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

## GET /api/sources

All job sources, sorted by `name` ascending. `type` is one of `GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER`. Empty table returns `{ "data": [] }`.

```json
{ "data": [ { "id": 3, "name": "Acme Careers", "type": "COMPANY", "url": "https://example.com" } ] }
```

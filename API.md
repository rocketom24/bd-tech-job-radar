# API

Read-only JSON API. No authentication, no pagination.

## Conventions

- Success: `{ "data": ... }`
- Error: `{ "error": { "message": string, "details"?: object } }`
- 500 responses are always `{ "error": { "message": "Internal server error" }}`; the real error is logged server-side only.

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

Values are trimmed; empty/whitespace-only values are ignored. Filters combine with AND. Unknown parameters are ignored.

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

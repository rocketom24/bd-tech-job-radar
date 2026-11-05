# Bangladesh Tech Job Radar — Architecture

A 3-day production-style demo. Keep it simple and realistic. Nothing is built without a reason.

**Status:** Day 1 backend is implemented: Prisma schema and migration, seed data, and three read-only endpoints (see [README.md](README.md) and [API.md](API.md) for what runs today). Sections 2, 7, 8 and 9 and the "planned" parts of sections 3 and 5 describe intent, not current behavior. Where this file and the code differ, the code, `API.md` and `DATABASE_DESIGN.md` are authoritative.

---

## 1. Product idea

### Problem
Bangladesh CSE/technology jobs are scattered across government websites, circulars and PDFs, company career pages, university notices, NGO/development sites, job portals, and other public announcements. There is no single place to search them. Job seekers visit many sites, miss postings, and see the same job repeated.

### Idea
Collect those postings into one searchable portal. Every job is stored in one common shape, linked to the source it came from, and searchable by keyword and filters.

---

## 2. Eventual architecture (full vision, not Day 1)

```
Sources -> Collection -> Raw Content -> Extraction -> Normalization
        -> Validation -> Deduplication -> PostgreSQL -> API -> Frontend
```

| Stage | Purpose |
|---|---|
| Sources | Where jobs are published (government, company, university, NGO, portal, other) |
| Collection | Fetch pages, files, images |
| Raw Content | Keep what was fetched untouched, so extraction can be re-run |
| Extraction | Pull fields out of the raw content |
| Normalization | Map to the one Job shape |
| Validation | Reject or flag incomplete/malformed jobs |
| Deduplication | One record for the same job seen in several places |
| PostgreSQL / API / Frontend | Store, serve, show |

Possible future extraction paths:

```
HTML        -> HTML extractor
PDF         -> text extraction
Image       -> OCR -> text
Plain text  -> extraction
```

**None of this is implemented in Phase 1 or Day 1.**

---

## 3. Day 1 architecture

### Stack
Next.js, TypeScript, App Router, Route Handlers, Zod, Prisma, PostgreSQL on Neon, Git/GitHub, Postman.

### Request flow

```
Client
  -> HTTP request
  -> Next.js Route Handler
  -> validation (Zod)
  -> Prisma
  -> PostgreSQL (Neon)
  -> JSON response
```

### Responsibilities

| Piece | Responsibility | Does not do |
|---|---|---|
| Next.js | Routing by file path, hosts the API (and the frontend on Day 3), env loading | Business rules, data access |
| Route Handler | HTTP edge: read request, validate, call Prisma, return JSON with the right status code (200 / 400 / 404 / 500) | SQL, ingestion logic |
| Zod | Validate and parse untrusted input (query params, `id`) and reject bad input with 400 | Enforce storage integrity |
| Prisma | Schema, migrations, type-safe client; the only code that talks to the DB; parameterized queries | HTTP concerns |
| PostgreSQL (Neon) | Source of truth; enforces primary keys, foreign keys, enums, NOT NULL, indexes; case-insensitive matching | Nothing outside storage |

### Principles
- Route handlers may call Prisma directly.
- Extract a shared function only when real duplication appears.
- No controllers, services, repositories, DAOs, factories, managers.
- Public APIs are **read-only** in Day 1. Only migrations and the seed script write to the database.
- No authentication, no usage enforcement in Day 1.

### File layout (as implemented; also `lib/log.ts` for safe error logging and `prisma.config.ts` for CLI config)

```
app/api/jobs/route.ts
app/api/jobs/[id]/route.ts
app/api/sources/route.ts
lib/prisma.ts          # single Prisma client instance
lib/schemas.ts         # Zod schemas
prisma/schema.prisma
prisma/seed.ts
```

---

## 4. Database entities (Day 1)

Relationships:

```
JobSource 1 --- many Job
User      1 --- many Usage
```

### JobSource
| Field | Notes |
|---|---|
| id | primary key |
| name | e.g. a ministry, company, university |
| type | **enum** `GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER` |
| url | the source's home/listing URL |

### Job
| Field | Notes |
|---|---|
| id | primary key |
| title | |
| organization | hiring organization (can differ from the source, e.g. a portal listing a company's job) |
| sector | broad sector, e.g. government, banking, telecom, NGO |
| category | tech role area, e.g. software engineering, data, networking |
| location | |
| description | |
| salary | **legacy** free text (postings say "negotiable", "as per scale", ranges); kept for display |
| salaryMin / salaryMax | nullable `DECIMAL(12,2)` |
| salaryCurrency | nullable `CHAR(3)`; not assumed to be BDT |
| salaryPeriod | nullable enum `MONTHLY` / `YEARLY` / `HOURLY` |
| salaryDisclosure | nullable enum `DISCLOSED` / `NEGOTIABLE` / `NOT_DISCLOSED`; `null` = legacy row |

Structured salary was added **beside** the text, not instead of it, so existing rows and the API stay compatible and nothing is invented for legacy records. Consistency is enforced twice: Postgres CHECK constraints (migration `add_structured_salary`; Prisma cannot express CHECKs, so they live in the SQL only) and `salarySchema` in `lib/schemas.ts`. See [API.md](API.md#salary).

| experience | free text |
| skills | list of skills |
| deadline | **nullable**: many real postings have none |
| sourceId | foreign key to JobSource |
| sourceUrl | link to the original posting |
| verified | boolean, whether the posting was checked against its source |
| createdAt | |

### User (forward-looking, table only)
| Field | Notes |
|---|---|
| id | primary key |
| email | unique |
| subscriptionStatus | status of a future subscription |
| createdAt | |

### Usage (forward-looking, table only)
| Field | Notes |
|---|---|
| id | primary key |
| userId | foreign key to User |
| endpoint | which endpoint was called |
| createdAt | |

`User` and `Usage` exist so Day 3's usage-restriction demo and later quota work have a place to record. In Day 1 nothing reads or writes them and no endpoint touches them.

### Why JobSource is separate from Job
One source publishes many jobs. Repeating source details on every job row would duplicate data and let copies drift. A separate table means:
- source details are stored and edited once
- `GET /api/sources` is a simple query
- each job answers "where did this come from?" through a foreign key
- Day 2 ingestion attaches new jobs to an existing source
- deduplication can compare the same job across different sources

### Constraints and indexes (to decide in the Prisma schema)
- foreign keys with a sensible delete rule (a source with jobs should not be deletable silently)
- unique `User.email`
- index on `Job.sourceId`
- `type` enforced by the database enum

---

## 5. API plan (Day 1, read-only)

> Original plan. Implemented: `keyword` (title, organization **and description**), `location` and `category` only. Not implemented: `sector`, `sourceId`, `verified` filters and pagination. Current behavior is in [API.md](API.md).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs` | List jobs, with optional filters |
| GET | `/api/jobs/:id` | One job, including its source |
| GET | `/api/sources` | List sources |

### `GET /api/jobs` query parameters (basic filtering)
- `keyword`: case-insensitive match (`ILIKE`) on **title and organization**. Full-text search is postponed.
- other simple filters over existing fields, e.g. `sector`, `category`, `location`, `sourceId`, `verified`
- basic pagination (`limit`, `page` or similar)

All query and path parameters are validated with Zod.

### Error handling
- `400` invalid input (Zod failure), with a readable message
- `404` job not found
- `500` unexpected error, generic message, no internals leaked
- consistent JSON error shape

### Testing and documentation
- Postman collection covering each endpoint, filters, and error cases
- short README section on how to run, migrate, seed, and call the API

---

## 6. Day 1 scope summary

- PostgreSQL database on Neon
- Prisma schema and migrations
- relationships and constraints
- seed 20-30 realistic jobs (across several sources and all relevant source types)
- validation and error handling
- the three read APIs and basic filtering
- testing and documentation

---

## 7. Day 2 scope

Real ingestion from a **small number of practical sources**:

```
source collection -> extraction -> normalization -> validation
                  -> basic deduplication -> database
```

Only the extraction paths the chosen sources need. Basic deduplication only (e.g. same title + organization + source URL).

---

## 8. Day 3 scope

- minimal frontend
- search and filter
- job details page
- links back to the original source
- basic usage-restriction demo (uses `User` and `Usage`)
- deployment

---

## 9. Postponed (not in the 3-day demo)

- authentication / login / register
- JWT
- real quota enforcement implementation
- payment / subscription system
- IP / device abuse protection
- large-scale scraping
- OCR pipeline
- AI extraction
- complex deduplication
- Redis
- background workers
- Elasticsearch / full-text search
- admin dashboard
- complex enterprise architecture

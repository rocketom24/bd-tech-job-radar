# Database Design

PostgreSQL on Neon. Four tables. The Prisma schema (`prisma/schema.prisma`) and the initial migration implement this design; the migration SQL is the source of truth.

```
JobSource 1 ---< Job
User      1 ---< Usage
```

## Tables

### JobSource
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| name | text | NO | ministry, company, university... |
| type | enum `JobSourceType` | NO | `GOVERNMENT`, `COMPANY`, `UNIVERSITY`, `NGO`, `PORTAL`, `OTHER` |
| url | text | NO | source home/listing URL |

### Job
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| title | text | NO | |
| organization | text | NO | hiring org, may differ from the source |
| sector | text | NO | broad sector |
| category | text | NO | tech role area |
| location | text | NO | |
| description | text | NO | |
| salary | text | NO, default `''` | legacy free text, kept unchanged |
| salaryMin | numeric(12,2) | YES | |
| salaryMax | numeric(12,2) | YES | |
| salaryCurrency | char(3) | YES | uppercase code, e.g. BDT |
| salaryPeriod | `SalaryPeriod` enum | YES | MONTHLY, YEARLY, HOURLY |
| salaryDisclosure | `SalaryDisclosure` enum | YES | DISCLOSED, NEGOTIABLE, NOT_DISCLOSED; NULL = legacy row |
| experience | text | NO, default `''` | free text |
| skills | text[] | NO, default `{}` | |
| deadline | timestamptz | **YES** | many postings have none |
| sourceId | integer | NO | **FK** -> JobSource.id |
| sourceUrl | text | NO | link to original posting |
| verified | boolean | NO, default `false` | |
| createdAt | timestamptz | NO, default `now()` | |

### User
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| email | text | NO | **UNIQUE**; app stores it trimmed + lower-cased |
| passwordHash | text | YES | scrypt, `scrypt$v1$N$r$p$salt$hash`; NULL for users created before auth |
| subscriptionStatus | text | NO, default `'FREE'` | not a DB enum; the app accepts only `FREE`/`PRO` (`lib/entitlements.ts`), new users are `FREE`, set server-side only |
| createdAt | timestamptz | NO, default `now()` | |

### Session (migration `add_auth_sessions`, additive)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| tokenHash | text | NO | **UNIQUE**; SHA-256 hex of the cookie token (raw token never stored) |
| userId | integer | NO | **FK** -> User.id, `ON DELETE CASCADE` |
| expiresAt | timestamptz | NO | created + 7 days, fixed |
| createdAt | timestamptz | NO, default `now()` | |
| lastUsedAt | timestamptz | YES | reserved, currently unused |

### Usage
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| userId | integer | NO | **FK** -> User.id |
| endpoint | text | NO | |
| createdAt | timestamptz | NO, default `now()` | |

### JobView (migration `add_job_views_apply_clicks`, additive)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| userId | integer | NO | **FK** -> User.id, ON DELETE CASCADE |
| jobId | integer | NO | **FK** -> Job.id, ON DELETE CASCADE, indexed |
| createdAt | timestamptz | NO, default `now()` | |

`UNIQUE (userId, jobId)`: one row per user per job = a unique view.

### ApplyClick (same migration)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | integer identity | NO | **PK** |
| userId | integer | NO | **FK** -> User.id, ON DELETE CASCADE |
| jobId | integer | NO | **FK** -> Job.id, ON DELETE CASCADE, indexed |
| createdAt | timestamptz | NO, default `now()` | |

Index `(userId, createdAt)`. Deliberately **not** unique: each click is a row. The older `Usage` table is unused by Phase 4 (generic endpoint log; it cannot express uniqueness).

## Foreign keys

| FK | Delete rule | Why |
|---|---|---|
| Job.sourceId -> JobSource.id | `RESTRICT` | a source that still has jobs cannot be deleted silently |
| Usage.userId -> User.id | `RESTRICT` | usage history must not vanish when a user row is touched |
| Session.userId -> User.id | `CASCADE` | sessions are disposable; deleting a user removes their logins |

Update rule is the default (`NO ACTION`); ids never change.

## Constraints summary

- PKs on all five `id` columns (incl. `Session`).
- `User.email` UNIQUE.
- `Job.deadline` and the five structured salary columns are the only nullable `Job` columns.
- Salary CHECKs: `Job_salary_amounts_nonnegative`, `Job_salary_min_le_max`, `Job_salary_currency_format`, `Job_salary_disclosure_consistency` (DISCLOSED needs currency + period + an amount; NEGOTIABLE/NOT_DISCLOSED allow no amounts or currency; NULL disclosure means all structured columns NULL). Migration `add_structured_salary` (additive, SQL only).
- `JobSource.type` limited to six values by a Postgres enum.
- Empty-string defaults on `salary`/`experience` and `{}` on `skills` keep reads free of null handling.
- Case-insensitive email uniqueness is handled by lower-casing in the app (Zod, Phase 5+), not a DB rule.

## Indexes

Postgres does **not** auto-index FK columns, only PKs and UNIQUE.

| Index | For |
|---|---|
| `Job(sourceId)` | FK joins, `?sourceId=` filter, the `RESTRICT` check on source delete |
| `Job(createdAt DESC)` | default "newest first" listing |
| `Job(sector)` | `?sector=` filter |
| `Job(category)` | `?category=` filter |
| `Session(tokenHash)` UNIQUE | session lookup on every authenticated request |
| `Session(userId)` | FK, per-user session cleanup |
| `Session(expiresAt)` | future sweep of expired sessions |
| `Usage(userId, createdAt)` | future "calls by user in a time window" quota check |

Deliberately **not** indexed: `keyword` search. `ILIKE '%x%'` cannot use a btree index. At Day 1 data size a scan is fine. If it gets slow, add `pg_trgm` (later, not now). `location`, `verified`, `deadline` are skipped until a real slow query shows up.

## Why JobSource is separate from Job

One source publishes many jobs. Copying source name/type/url onto every job row duplicates data and lets copies drift. Separate table: edit a source once, `GET /api/sources` is a trivial query, every job answers "where from?" through an FK, and ingestion attaches new jobs to an existing source. `Job.organization` stays on the job because a portal source can list a job for a different company.

## PostgreSQL vs Neon

- **PostgreSQL** is the database engine: tables, types, constraints, indexes, SQL. All design above is plain Postgres and would run on any Postgres.
- **Neon** is the hosting service that runs Postgres for us: serverless, free tier, scale-to-zero, branching. It adds a connection **pooler** and a cold-start delay after idle.
- Practical effect: two URLs. `DATABASE_URL` (pooled, for the app) and `DIRECT_URL` (unpooled, for migrations). Migrations need a direct connection.

## Environment variables

| Name | Used by | Source |
|---|---|---|
| `DATABASE_URL` | app runtime | Neon dashboard -> Connect -> pooled |
| `DIRECT_URL` | Prisma CLI (migrations, validate) | Neon dashboard -> Connect -> direct (untick "Connection pooling") |

Stored in `.env` (git-ignored). `.env.example` holds placeholders and is committed.

## Reference DDL

For checking only. `prisma/migrations/` is the source of truth.

```sql
CREATE TYPE "JobSourceType" AS ENUM
  ('GOVERNMENT','COMPANY','UNIVERSITY','NGO','PORTAL','OTHER');

CREATE TYPE "SalaryPeriod" AS ENUM ('MONTHLY','YEARLY','HOURLY');
CREATE TYPE "SalaryDisclosure" AS ENUM ('DISCLOSED','NEGOTIABLE','NOT_DISCLOSED');
-- plus the four salary CHECK constraints: see prisma/migrations/*_add_structured_salary/migration.sql

CREATE TABLE "JobSource" (
  "id"   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "name" text NOT NULL,
  "type" "JobSourceType" NOT NULL,
  "url"  text NOT NULL
);

CREATE TABLE "Job" (
  "id"           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "title"        text NOT NULL,
  "organization" text NOT NULL,
  "sector"       text NOT NULL,
  "category"     text NOT NULL,
  "location"     text NOT NULL,
  "description"  text NOT NULL,
  "salary"       text NOT NULL DEFAULT '',
  "salaryMin"        numeric(12,2),
  "salaryMax"        numeric(12,2),
  "salaryCurrency"   char(3),
  "salaryPeriod"     "SalaryPeriod",
  "salaryDisclosure" "SalaryDisclosure",
  "experience"   text NOT NULL DEFAULT '',
  "skills"       text[] NOT NULL DEFAULT '{}',
  "deadline"     timestamptz,
  "sourceId"     integer NOT NULL REFERENCES "JobSource"("id") ON DELETE RESTRICT,
  "sourceUrl"    text NOT NULL,
  "verified"     boolean NOT NULL DEFAULT false,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "Job_sourceId_idx"  ON "Job"("sourceId");
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt" DESC);
CREATE INDEX "Job_sector_idx"    ON "Job"("sector");
CREATE INDEX "Job_category_idx"  ON "Job"("category");

CREATE TABLE "User" (
  "id"                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "email"              text NOT NULL UNIQUE,
  "passwordHash"       text,
  "subscriptionStatus" text NOT NULL DEFAULT 'FREE',
  "createdAt"          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "Session" (
  "id"         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "tokenHash"  text NOT NULL UNIQUE,
  "userId"     integer NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt" timestamptz
);
CREATE INDEX "Session_userId_idx"    ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "Usage" (
  "id"        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId"    integer NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "endpoint"  text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "Usage_userId_createdAt_idx" ON "Usage"("userId","createdAt");
```

## Open decisions (not blocking)

- `Job.sourceUrl` is not UNIQUE. Dedup is Day 2; add a unique/dedup key then.
- `subscriptionStatus` stays `text` for now (values `FREE`, `PRO`; no migration in Phase 3). Make it an enum or add a CHECK constraint once the plan list is stable. Unknown values in existing rows are rejected by the entitlement engine, not granted access.
- Phase 4 must decide how to store unique job views (a per-user/per-job record) and Apply clicks; the existing `Usage` table (`endpoint` + timestamp) cannot express uniqueness by itself. FREE limits: 10 unique views, 3 Apply clicks, per account, no reset.

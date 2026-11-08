// OpenAPI 3.1 description of the existing API. Served at /openapi.json and rendered by Scalar at /docs.
// Keep in sync with API.md and app/api/**.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const err = (description: string, code: string, message: string) => ({
  description,
  content: { "application/json": { schema: ref("ErrorResponse"), example: { error: { code, message } } } },
});
const jsonBody = (schemaName: string, example: unknown) => ({
  required: true,
  content: { "application/json": { schema: ref(schemaName), example } },
});
const ok = (description: string, schema: object, example?: unknown) => ({
  description,
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});

const idParam = {
  name: "id",
  in: "path",
  required: true,
  description: "Positive integer without leading zeros, at most 2147483647.",
  schema: { type: "string", pattern: "^[1-9][0-9]*$", example: "4" },
};

const UNAUTH = err("No valid session cookie.", "UNAUTHENTICATED", "Not authenticated");
const BAD_ID = err("Job id is not a positive integer.", "INVALID_JOB_ID", "Invalid job id: must be a positive integer");
const NOT_FOUND = err("No job with this id.", "JOB_NOT_FOUND", "Job not found");
const BAD_PLAN = err("The stored subscription status is neither FREE nor PRO (fails closed).", "INVALID_SUBSCRIPTION", "Subscription status is invalid");
const FOREIGN = err("Cross-origin request rejected.", "FORBIDDEN_ORIGIN", "Cross-origin request rejected");
const ISE = err("Unexpected server error.", "INTERNAL_ERROR", "Internal server error");
const RATE = {
  description: "Per-user or per-IP rate limit exceeded. `Retry-After` is in seconds.",
  headers: { "Retry-After": { schema: { type: "integer" } } },
  content: { "application/json": { schema: ref("ErrorResponse"), example: { error: { code: "RATE_LIMITED", message: "Too many requests" } } } },
};

const exampleJob = {
  id: 4,
  title: "Backend Engineer",
  organization: "Acme",
  sector: "Private",
  category: "Software",
  location: "Dhaka",
  salary: "Tk 70,000 - 110,000",
  salaryMin: "70000",
  salaryMax: "110000",
  salaryCurrency: "BDT",
  salaryPeriod: "MONTHLY",
  salaryDisclosure: "DISCLOSED",
  experience: "2+ years",
  skills: ["Node.js", "PostgreSQL"],
  deadline: "2026-12-10T00:00:00.000Z",
  sourceId: 3,
  verified: false,
  createdAt: "2026-11-04T10:00:00.000Z",
};
const exampleUser = { id: 7, email: "user@example.com", subscriptionStatus: "FREE", createdAt: "2026-11-07T13:00:00.000Z" };
const credentials = { email: "user@example.com", password: "a-secure-password" };
const authResponses = (success: { status: string; description: string }) => ({
  [success.status]: ok(success.description, { type: "object", required: ["data"], properties: { data: ref("SafeUser") } }, { data: exampleUser }),
  "400": err("Validation error (`details` maps field names to messages) or malformed JSON (`INVALID_JSON`).", "VALIDATION_ERROR", "Invalid request body"),
  "403": FOREIGN,
  "413": err("Body over 10,000 characters.", "PAYLOAD_TOO_LARGE", "Request body too large"),
  "429": RATE,
  "500": ISE,
});

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "BD Tech Job Radar API",
    version: "1.0.0",
    description: [
      "JSON API for Bangladesh's technology job listings.",
      "",
      "**Authentication.** Register and login set an HTTP-only `bdr_session` cookie (7 days, fixed). It is never returned in JSON. Browsers send it automatically; in Scalar, call register or login first, then try the protected endpoints from the same origin.",
      "",
      "**Quotas (lifetime, per account).** FREE: 10 *unique* job-detail views and 3 Apply clicks. PRO: unlimited. Listing and searching are unlimited for everyone. There is no payment system: an account cannot change its own plan.",
      "",
      "**Opening a job detail records a view.** `GET /api/jobs/{id}` already records the unique view, so clients must not also call `POST /api/jobs/{id}/view`. Re-opening a job already viewed is free, even after the limit is reached.",
      "",
      "**Errors** always have the shape `{ \"error\": { \"code\", \"message\", \"details?\" } }`. Branch on `code`; `message` may change.",
      "",
      "**CSRF.** State-changing POSTs reject a cross-origin `Origin` (or `Sec-Fetch-Site: cross-site` without `Origin`) with 403 `FORBIDDEN_ORIGIN`.",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Same origin as this page" }],
  tags: [
    { name: "Auth", description: "Email + password accounts and sessions." },
    { name: "Jobs", description: "Public job list and quota-gated job detail." },
    { name: "Usage", description: "Quota-tracked actions and the account's usage." },
    { name: "Sources", description: "Where jobs come from." },
  ],
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        description: "Creates a FREE account and starts a session. Any `subscriptionStatus` in the body is ignored. Rate limit: 5 per hour per client IP.",
        operationId: "register",
        requestBody: jsonBody("Credentials", credentials),
        responses: {
          ...authResponses({ status: "201", description: "Account created; `bdr_session` cookie set." }),
          "409": err("Email already registered (case-insensitive).", "EMAIL_TAKEN", "An account with this email already exists"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description: "Starts a new session (existing sessions stay valid). Rate limit: 20 per 15 min per client IP and 10 per 15 min per target email.",
        operationId: "login",
        requestBody: jsonBody("Credentials", credentials),
        responses: {
          ...authResponses({ status: "200", description: "Logged in; `bdr_session` cookie set." }),
          "401": err("Unknown email, wrong password, or account without a password (all identical).", "INVALID_CREDENTIALS", "Invalid email or password."),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        description: "Deletes the session behind the cookie and clears it. Idempotent: always 200, even when already logged out.",
        operationId: "logout",
        responses: {
          "200": ok("Logged out.", { type: "object", required: ["data"], properties: { data: { type: "object", properties: { loggedOut: { type: "boolean" } } } } }, { data: { loggedOut: true } }),
          "403": FOREIGN,
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        operationId: "me",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": ok("The signed-in user.", { type: "object", required: ["data"], properties: { data: ref("SafeUser") } }, { data: exampleUser }),
          "401": UNAUTH,
          "500": ISE,
        },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List jobs",
        description:
          "Public. Newest first, no pagination. Returns summaries: `description` and `sourceUrl` are only in the detail. Filters combine with AND; values are trimmed, empty values ignored, each parameter at most once. `keyword` also searches `description` but not `skills`. Matching is literal (`%`, `_`, `\\` are escaped).",
        operationId: "listJobs",
        parameters: [
          { name: "keyword", in: "query", description: "Case-insensitive substring of title, organization or description.", schema: { type: "string", maxLength: 100 } },
          { name: "location", in: "query", description: "Case-insensitive substring of location.", schema: { type: "string", maxLength: 100 } },
          { name: "category", in: "query", description: "Case-insensitive exact match of category.", schema: { type: "string", maxLength: 50 } },
        ],
        responses: {
          "200": ok("Matching jobs (possibly empty).", { type: "object", required: ["data"], properties: { data: { type: "array", items: ref("JobSummary") } } }, { data: [exampleJob] }),
          "400": err("Repeated or invalid query parameter, or NUL character.", "INVALID_QUERY", "Invalid query parameters"),
          "500": ISE,
        },
      },
    },
    "/api/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Job detail (records a view)",
        description:
          "Login required. Returns the full job and **records a unique job-detail view** for the account. FREE: 10 unique jobs, lifetime; a new job beyond that returns 429 `VIEW_LIMIT_REACHED` with no job data. Re-opening a viewed job is free. Shares quota, lock and rate limit (60/min per user) with `POST /api/jobs/{id}/view`. Check order: 401, 400, 404, 429.",
        operationId: "getJob",
        security: [{ sessionCookie: [] }],
        parameters: [idParam],
        responses: {
          "200": ok(
            "The job with description, sourceUrl and source.",
            { type: "object", required: ["data"], properties: { data: ref("JobDetail") } },
            { data: { ...exampleJob, description: "Build and run our APIs.", sourceUrl: "https://example.com/jobs/4", source: { id: 3, name: "Acme Careers", type: "COMPANY", url: "https://example.com" } } },
          ),
          "400": BAD_ID,
          "401": UNAUTH,
          "403": BAD_PLAN,
          "404": NOT_FOUND,
          "429": {
            description: "FREE view quota used up (`VIEW_LIMIT_REACHED`) or rate limited (`RATE_LIMITED`).",
            content: { "application/json": { schema: ref("ErrorResponse"), example: { error: { code: "VIEW_LIMIT_REACHED", message: "You have reached your free job-view limit." } } } },
          },
          "500": ISE,
        },
      },
    },
    "/api/jobs/{id}/view": {
      post: {
        tags: ["Usage"],
        summary: "Record a job view (compatibility)",
        description: "Records one *unique* view per user per job. Kept for compatibility: `GET /api/jobs/{id}` already records the view, so calling both costs one view. Rate limit 60/min per user.",
        operationId: "recordView",
        security: [{ sessionCookie: [] }],
        parameters: [idParam],
        responses: {
          "200": ok(
            "Recorded, or already viewed (nothing consumed).",
            { type: "object", required: ["success", "viewed", "alreadyViewed"], properties: { success: { const: true }, viewed: { type: "boolean" }, alreadyViewed: { type: "boolean" } } },
            { success: true, viewed: true, alreadyViewed: false },
          ),
          "400": BAD_ID,
          "401": UNAUTH,
          "403": BAD_PLAN,
          "404": NOT_FOUND,
          "429": err("FREE view quota used up, or rate limited.", "VIEW_LIMIT_REACHED", "You have reached your free job-view limit."),
          "500": ISE,
        },
      },
    },
    "/api/jobs/{id}/apply": {
      post: {
        tags: ["Usage"],
        summary: "Apply (record click, get link)",
        description:
          "Records one Apply click and returns the job's stored application URL. Every success counts, including repeats for the same job. No body; a client-supplied URL is ignored. FREE: 3 successful clicks; the fourth is rejected and stores nothing. PRO: unlimited. Rate limit 20/min per user.",
        operationId: "applyToJob",
        security: [{ sessionCookie: [] }],
        parameters: [idParam],
        responses: {
          "200": ok(
            "Click recorded.",
            { type: "object", required: ["success", "applyUrl", "remaining"], properties: { success: { const: true }, applyUrl: { type: "string", format: "uri" }, remaining: { type: ["integer", "null"], description: "Apply clicks left; null for PRO." } } },
            { success: true, applyUrl: "https://example.com/jobs/4", remaining: 2 },
          ),
          "400": BAD_ID,
          "401": UNAUTH,
          "403": BAD_PLAN,
          "404": NOT_FOUND,
          "422": err("The job's sourceUrl is not an http(s) URL; nothing is recorded.", "APPLY_URL_UNAVAILABLE", "This job has no valid application URL."),
          "429": err("FREE Apply quota used up (`APPLY_LIMIT_REACHED`) or rate limited (`RATE_LIMITED`).", "APPLY_LIMIT_REACHED", "You have reached your free Apply-click limit."),
          "500": ISE,
        },
      },
    },
    "/api/me/usage": {
      get: {
        tags: ["Usage"],
        summary: "Current usage",
        description: "Counts for the session user only. For PRO, `limit` and `remaining` are null and `unlimited` is true.",
        operationId: "getUsage",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": ok(
            "Usage and plan.",
            { type: "object", required: ["success", "data"], properties: { success: { const: true }, data: ref("Usage") } },
            { success: true, data: { subscriptionStatus: "FREE", jobViews: { used: 4, limit: 10, remaining: 6, unlimited: false }, applyClicks: { used: 1, limit: 3, remaining: 2, unlimited: false } } },
          ),
          "401": UNAUTH,
          "403": BAD_PLAN,
          "500": ISE,
        },
      },
    },
    "/api/sources": {
      get: {
        tags: ["Sources"],
        summary: "List sources",
        description: "Public. All job sources sorted by name.",
        operationId: "listSources",
        responses: {
          "200": ok("Sources (possibly empty).", { type: "object", required: ["data"], properties: { data: { type: "array", items: ref("Source") } } }, { data: [{ id: 3, name: "Acme Careers", type: "COMPANY", url: "https://example.com" }] }),
          "500": ISE,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "bdr_session", description: "HTTP-only session cookie set by register/login. Valid for a fixed 7 days." },
    },
    schemas: {
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254, description: "Trimmed and lower-cased." },
          password: { type: "string", minLength: 12, maxLength: 128, description: "Used exactly as sent. Login only requires non-empty." },
        },
      },
      SafeUser: {
        type: "object",
        required: ["id", "email", "subscriptionStatus", "createdAt"],
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          subscriptionStatus: { enum: ["FREE", "PRO"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      JobSummary: {
        type: "object",
        required: ["id", "title", "organization", "sector", "category", "location", "salary", "experience", "skills", "sourceId", "verified", "createdAt"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          organization: { type: "string" },
          sector: { type: "string" },
          category: { type: "string" },
          location: { type: "string" },
          salary: { type: "string", description: "Legacy free-text display string; may be empty." },
          salaryMin: { type: ["string", "null"], description: "Decimal serialized as a string." },
          salaryMax: { type: ["string", "null"], description: "Decimal serialized as a string." },
          salaryCurrency: { type: ["string", "null"], pattern: "^[A-Z]{3}$" },
          salaryPeriod: { enum: ["MONTHLY", "YEARLY", "HOURLY", null] },
          salaryDisclosure: { enum: ["DISCLOSED", "NEGOTIABLE", "NOT_DISCLOSED", null], description: "null = legacy row: use `salary`." },
          experience: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          deadline: { type: ["string", "null"], format: "date-time" },
          sourceId: { type: "integer" },
          verified: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      JobDetail: {
        allOf: [
          ref("JobSummary"),
          {
            type: "object",
            required: ["description", "sourceUrl", "source"],
            properties: { description: { type: "string" }, sourceUrl: { type: "string" }, source: ref("Source") },
          },
        ],
      },
      Source: {
        type: "object",
        required: ["id", "name", "type", "url"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          type: { enum: ["GOVERNMENT", "COMPANY", "UNIVERSITY", "NGO", "PORTAL", "OTHER"] },
          url: { type: "string" },
        },
      },
      UsageCounter: {
        type: "object",
        required: ["used", "limit", "remaining", "unlimited"],
        properties: {
          used: { type: "integer", minimum: 0 },
          limit: { type: ["integer", "null"] },
          remaining: { type: ["integer", "null"] },
          unlimited: { type: "boolean" },
        },
      },
      Usage: {
        type: "object",
        required: ["subscriptionStatus", "jobViews", "applyClicks"],
        properties: { subscriptionStatus: { enum: ["FREE", "PRO"] }, jobViews: ref("UsageCounter"), applyClicks: ref("UsageCounter") },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                description:
                  "Stable machine-readable code: VALIDATION_ERROR, INVALID_JSON, PAYLOAD_TOO_LARGE, INVALID_QUERY, INVALID_JOB_ID, JOB_NOT_FOUND, UNAUTHENTICATED, INVALID_CREDENTIALS, EMAIL_TAKEN, FORBIDDEN_ORIGIN, INVALID_SUBSCRIPTION, APPLY_URL_UNAVAILABLE, VIEW_LIMIT_REACHED, APPLY_LIMIT_REACHED, RATE_LIMITED, INTERNAL_ERROR.",
              },
              message: { type: "string", description: "For humans; may change." },
              details: { description: "Present on validation errors: field name to list of messages." },
            },
          },
        },
      },
    },
  },
} as const;

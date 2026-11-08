// Security + rate-limit HTTP tests. Run a dev server first with TRUSTED_IP_HEADER=x-forwarded-for and
// RATE_LIMIT_SECRET set (see .env.example), then npm run test:api (BASE_URL for another port).
// Creates sectest-*@example.test users (cascade-deleted afterwards) and deletes only the RateLimit rows
// whose keys these tests computed. Rate-limit buckets are keyed by a fresh fake client IP per test, so tests
// never interfere. A fixed window could roll over mid-test, so windowRoom() waits (on the DATABASE clock,
// not a guess) until enough of the window is left.
import assert from "node:assert/strict";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = `pw-${randomUUID()}`; // random per run: no fixed credential in the public repo
const RUN = randomUUID().slice(0, 8);
const sql = neon(process.env.DATABASE_URL).query;
const SECRET = process.env.RATE_LIMIT_SECRET;
const usedKeys = new Set();
const STARTED = new Date().toISOString();
let n = 0;
let ipN = 0;
let jobs = [];

const newEmail = () => `sectest-${RUN}-${++n}@example.test`;
const newIp = () => `203.0.113.${(++ipN % 250) + 1}-${RUN}-${ipN}`; // never a real address
const pseudo = (scope, value) => createHmac("sha256", SECRET).update(`${scope}\0${value}`).digest("hex").slice(0, 32);
const track = (name, scope, value) => {
  const key = `${name}:${pseudo(scope, value)}`;
  usedKeys.add(key);
  return key;
};

before(async () => {
  assert.ok(SECRET && SECRET.length >= 32, "RATE_LIMIT_SECRET must be set for these tests");
  jobs = await sql(`SELECT id FROM "Job" ORDER BY id LIMIT 3`);
});
after(async () => {
  await sql(`DELETE FROM "User" WHERE email LIKE 'sectest-%@example.test'`);
  if (usedKeys.size) await sql(`DELETE FROM "RateLimit" WHERE key = ANY($1)`, [[...usedKeys]]);
  // helper registrations/logins used throwaway fake IPs whose keys are not tracked individually (dev database only)
  await sql(`DELETE FROM "RateLimit" WHERE "windowStart" >= $1::timestamptz - interval '1 hour' AND key LIKE ANY (ARRAY['register:%', 'loginIp:%', 'loginEmail:%', 'view:%', 'apply:%'])`, [STARTED]);
});

async function windowRoom(windowSec, needSec = 20) {
  const [{ left }] = await sql(`SELECT ($1::int - (extract(epoch from now())::bigint % $1::int))::int AS left`, [windowSec]);
  if (left < needSec) await new Promise((r) => setTimeout(r, (left + 1) * 1000)); // wait for the next fixed window
}

async function call(path, { method = "POST", body, cookie, ip = newIp(), headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      "x-forwarded-for": ip,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json(),
    cookie: res.headers.getSetCookie().find((c) => c.startsWith("bdr_session="))?.split(";")[0],
  };
}
async function newUser(plan = "FREE") {
  const r = await call("/api/auth/register", { body: { email: newEmail(), password: PASSWORD } });
  assert.equal(r.status, 201);
  if (plan !== "FREE") await sql(`UPDATE "User" SET "subscriptionStatus" = $1 WHERE id = $2`, [plan, r.body.data.id]);
  return { id: r.body.data.id, cookie: r.cookie };
}
async function rawJson(path, text) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": newIp() }, body: text });
  return { status: res.status, body: await res.json() };
}
const count = async (table, userId) => (await sql(`SELECT count(*)::int AS c FROM "${table}" WHERE "userId" = $1`, [userId]))[0].c;
const code = (r) => r.body.error?.code;

// ---- error format -------------------------------------------------------------------
test("every error response is { error: { code, message } } with no internals", async () => {
  const u = await newUser();
  const cases = [
    [await call("/api/auth/me", { method: "GET" }), 401, "UNAUTHENTICATED"],
    [await call("/api/auth/login", { body: {} }), 400, "VALIDATION_ERROR"],
    [await call("/api/auth/register", { body: {} }), 400, "VALIDATION_ERROR"],
    [await call("/api/auth/login", { body: { email: newEmail(), password: "x" } }), 401, "INVALID_CREDENTIALS"],
    [await rawJson("/api/auth/register", "{nope"), 400, "INVALID_JSON"],
    [await call("/api/jobs?keyword=a&keyword=b", { method: "GET" }), 400, "INVALID_QUERY"],
    [await call("/api/jobs/abc", { method: "GET" }), 401, "UNAUTHENTICATED"],
    [await call("/api/jobs/abc", { method: "GET", cookie: u.cookie }), 400, "INVALID_JOB_ID"],
    [await call("/api/jobs/2000000000", { method: "GET", cookie: u.cookie }), 404, "JOB_NOT_FOUND"],
    [await call(`/api/jobs/${jobs[0].id}/view`), 401, "UNAUTHENTICATED"],
    [await call(`/api/jobs/${jobs[0].id}/apply`), 401, "UNAUTHENTICATED"],
    [await call("/api/me/usage", { method: "GET" }), 401, "UNAUTHENTICATED"],
    [await call("/api/jobs/abc/view", { cookie: u.cookie }), 400, "INVALID_JOB_ID"],
  ];
  for (const [r, status, errCode] of cases) {
    assert.equal(r.status, status, errCode);
    assert.equal(code(r), errCode);
    assert.equal(typeof r.body.error.message, "string");
    assert.deepEqual(Object.keys(r.body), ["error"]);
    assert.ok(!/stack|prisma|SELECT|    at /i.test(JSON.stringify(r.body)), "no internals in " + errCode);
  }
});

test("oversized body is rejected before parsing (413)", async () => {
  const r = await call("/api/auth/login", { body: { email: "a@example.test", password: "x".repeat(20_000) } });
  assert.equal(r.status, 413);
  assert.equal(code(r), "PAYLOAD_TOO_LARGE");
});

// ---- origin / CSRF ------------------------------------------------------------------
test("foreign Origin is rejected on every state-changing endpoint, with no side effects", async () => {
  const u = await newUser();
  const evil = { origin: "https://evil.example" };
  const cases = [
    ["/api/auth/register", { email: newEmail(), password: PASSWORD }],
    ["/api/auth/login", { email: newEmail(), password: PASSWORD }],
    ["/api/auth/logout", undefined],
    [`/api/jobs/${jobs[0].id}/view`, undefined],
    [`/api/jobs/${jobs[0].id}/apply`, undefined],
  ];
  for (const [path, body] of cases) {
    const r = await call(path, { body, cookie: u.cookie, headers: evil });
    assert.equal(r.status, 403, path);
    assert.equal(code(r), "FORBIDDEN_ORIGIN");
    assert.equal(r.cookie, undefined, "no cookie set");
  }
  assert.equal(await count("JobView", u.id), 0);
  assert.equal(await count("ApplyClick", u.id), 0);
  assert.equal((await call("/api/auth/me", { method: "GET", cookie: u.cookie })).status, 200, "foreign logout did not end the session");
});

test("Origin policy: opaque 'null' and Sec-Fetch-Site cross-site are rejected; same-origin and header-less pass", async () => {
  const u = await newUser();
  const host = new URL(BASE).host;
  const view = (headers) => call(`/api/jobs/${jobs[1].id}/view`, { cookie: u.cookie, headers });
  assert.equal((await view({ origin: "null" })).status, 403);
  assert.equal((await view({ "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await view({ origin: `http://${host}` })).status, 200, "same origin");
  assert.equal((await view({ "sec-fetch-site": "same-origin" })).status, 200);
  assert.equal((await view({})).status, 200, "no Origin (Postman/curl)");
});

// ---- authorization ------------------------------------------------------------------
test("users cannot read or act as another user", async () => {
  const a = await newUser();
  const b = await newUser();
  assert.equal((await call(`/api/jobs/${jobs[0].id}/view`, { cookie: a.cookie, body: { userId: b.id } })).status, 200);
  assert.equal(await count("JobView", a.id), 1);
  assert.equal(await count("JobView", b.id), 0);
  const usage = await call(`/api/me/usage?userId=${a.id}`, { method: "GET", cookie: b.cookie });
  assert.equal(usage.status, 200);
  assert.equal(usage.body.data.jobViews.used, 0, "B sees B's usage, not A's");
});

test("client cannot grant itself PRO (headers, query, body) on usage routes", async () => {
  const u = await newUser();
  for (let i = 0; i < 3; i++) assert.equal((await call(`/api/jobs/${jobs[0].id}/apply`, { cookie: u.cookie })).status, 200);
  const r = await call(`/api/jobs/${jobs[0].id}/apply?subscriptionStatus=PRO`, {
    cookie: u.cookie,
    body: { subscriptionStatus: "PRO", plan: "PRO" },
    headers: { "x-subscription-status": "PRO" },
  });
  assert.equal(r.status, 429);
  assert.equal(code(r), "APPLY_LIMIT_REACHED");
  assert.equal(await count("ApplyClick", u.id), 3);
});

test("unknown stored subscription status fails closed on view and apply", async () => {
  const u = await newUser("GOLD");
  const v = await call(`/api/jobs/${jobs[0].id}/view`, { cookie: u.cookie });
  const a = await call(`/api/jobs/${jobs[0].id}/apply`, { cookie: u.cookie });
  for (const r of [v, a]) {
    assert.equal(r.status, 403);
    assert.equal(code(r), "INVALID_SUBSCRIPTION");
  }
  assert.equal(await count("JobView", u.id), 0);
  assert.equal(await count("ApplyClick", u.id), 0);
});

test("sessions: only the token HASH is stored; logout deletes the row", async () => {
  const u = await newUser();
  const token = u.cookie.split("=")[1];
  const hash = createHash("sha256").update(token).digest("hex");
  assert.equal((await sql(`SELECT 1 FROM "Session" WHERE "tokenHash" = $1`, [hash])).length, 1);
  assert.equal((await sql(`SELECT 1 FROM "Session" WHERE "tokenHash" = $1`, [token])).length, 0, "raw token not stored");
  assert.equal((await call("/api/auth/logout", { cookie: u.cookie })).status, 200);
  assert.equal((await sql(`SELECT 1 FROM "Session" WHERE "tokenHash" = $1`, [hash])).length, 0);
});

// ---- security headers ---------------------------------------------------------------
test("security headers are present", async () => {
  const res = await fetch(BASE + "/api/sources");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(res.headers.get("x-powered-by"), null);
});

// ---- rate limiting ------------------------------------------------------------------
function assertSafe429(r, secret) {
  assert.equal(r.status, 429);
  assert.equal(code(r), "RATE_LIMITED");
  assert.deepEqual(Object.keys(r.body.error).sort(), ["code", "message"]);
  assert.ok(Number(r.headers.get("retry-after")) >= 1, "Retry-After header");
  const text = JSON.stringify(r.body);
  assert.ok(!secret || !text.includes(secret), "no IP/email in body");
  assert.ok(!/loginIp|loginEmail|RateLimit|windowStart/.test(text), "no internal key names in body");
}

test("login: per-IP limit (20 / 15 min) -> 429; other IPs unaffected; state lives in the database", async () => {
  await windowRoom(900);
  const ip = newIp();
  const key = track("loginIp", "ip", ip);
  for (let i = 0; i < 20; i++) assert.equal((await call("/api/auth/login", { body: {}, ip })).status, 400, `attempt ${i + 1}`);
  assertSafe429(await call("/api/auth/login", { body: {}, ip }), ip);
  assert.equal((await call("/api/auth/login", { body: {} })).status, 400, "a different IP is not limited");
  const [row] = await sql(`SELECT sum(count)::int AS c FROM "RateLimit" WHERE key = $1`, [key]);
  assert.equal(row.c, 21, "all 21 hits counted in Postgres");
  const raw = await sql(`SELECT 1 FROM "RateLimit" WHERE key LIKE '%' || $1 || '%'`, [ip]);
  assert.equal(raw.length, 0, "no raw IP stored");
});

test("login: per-email limit (10 / 15 min) holds across different IPs", async () => {
  await windowRoom(900);
  const email = newEmail();
  track("loginEmail", "email", email);
  for (let i = 0; i < 10; i++) assert.equal((await call("/api/auth/login", { body: { email, password: "wrong-password" } })).status, 401);
  assertSafe429(await call("/api/auth/login", { body: { email, password: "wrong-password" } }), email);
  assert.equal((await call("/api/auth/login", { body: { email: newEmail(), password: "wrong-password" } })).status, 401, "other email fine");
  const raw = await sql(`SELECT 1 FROM "RateLimit" WHERE key LIKE '%' || $1 || '%'`, [email]);
  assert.equal(raw.length, 0, "no raw email stored");
});

test("register: per-IP limit (5 / hour) -> 429 before any account is created", async () => {
  await windowRoom(3600);
  const ip = newIp();
  track("register", "ip", ip);
  for (let i = 0; i < 4; i++) assert.equal((await call("/api/auth/register", { body: {}, ip })).status, 400);
  assert.equal((await call("/api/auth/register", { body: { email: newEmail(), password: PASSWORD }, ip })).status, 201, "5th is still allowed");
  const email = newEmail();
  const over = await call("/api/auth/register", { body: { email, password: PASSWORD }, ip });
  assertSafe429(over, ip);
  assert.equal(over.cookie, undefined);
  assert.equal((await sql(`SELECT 1 FROM "User" WHERE email = $1`, [email])).length, 0, "limited request created no account");
  assert.equal((await call("/api/auth/register", { body: { email: newEmail(), password: PASSWORD } })).status, 201, "other IP fine");
});

test("view: 60 / min per user, enforced atomically under concurrency; quota unaffected", async () => {
  await windowRoom(60);
  const u = await newUser("PRO");
  usedKeys.add(`view:${u.id}`);
  const results = await Promise.all(Array.from({ length: 65 }, () => call(`/api/jobs/${jobs[0].id}/view`, { cookie: u.cookie })));
  const limited = results.filter((r) => r.status === 429);
  assert.equal(results.filter((r) => r.status === 200).length, 60);
  assert.equal(limited.length, 5);
  for (const r of limited) assertSafe429(r, "");
  assert.equal(await count("JobView", u.id), 1, "repeat views never added rows");
});

test("apply: 20 / min per user -> RATE_LIMITED (distinct from the quota code); other users unaffected", async () => {
  await windowRoom(60);
  const u = await newUser("PRO");
  usedKeys.add(`apply:${u.id}`);
  for (let i = 0; i < 20; i++) assert.equal((await call(`/api/jobs/${jobs[0].id}/apply`, { cookie: u.cookie })).status, 200);
  assertSafe429(await call(`/api/jobs/${jobs[0].id}/apply`, { cookie: u.cookie }), "");
  assert.equal(await count("ApplyClick", u.id), 20, "the limited request recorded no click");
  const other = await newUser();
  assert.equal((await call(`/api/jobs/${jobs[0].id}/apply`, { cookie: other.cookie })).status, 200);
});

test("rate limits do not apply to public GET endpoints", async () => {
  const ip = newIp();
  for (let i = 0; i < 25; i++) assert.equal((await call("/api/sources", { method: "GET", ip })).status, 200);
});

// Usage tracking HTTP tests. Run a dev server first (npm run dev, or BASE_URL=... for another port), then npm run test:api.
// Creates users usagetest-*@example.test (JobView/ApplyClick rows cascade) and, for one test only, a job titled
// "usagetest-bad-url" that is deleted in a finally block. Run with --test-concurrency=1 (npm run test:api does) so
// that temporary job never overlaps the job-list tests. Counts are always verified directly in the database, over parameterised SQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const RUN = randomUUID().slice(0, 8);
let n = 0;
const sql = neon(process.env.DATABASE_URL).query;
let jobs = []; // [{ id, sourceUrl }] real seeded jobs

before(async () => {
  jobs = await sql(`SELECT id, "sourceUrl" FROM "Job" ORDER BY id LIMIT 14`);
  assert.ok(jobs.length >= 14, "needs at least 14 seeded jobs (npm run db:seed)");
});
const STARTED = new Date().toISOString();
after(async () => {
  await sql(`DELETE FROM "User" WHERE email LIKE 'usagetest-%@example.test'`);
  // dev-database only: removes the rate-limit rows these requests created (fake IPs; per-user keys are view:<id>/apply:<id>)
  await sql(`DELETE FROM "RateLimit" WHERE "windowStart" >= $1::timestamptz - interval '1 hour' AND key LIKE ANY (ARRAY['register:%', 'view:%', 'apply:%'])`, [STARTED]);
});

async function call(path, { method = "POST", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), "x-forwarded-for": `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers.getSetCookie().find((c) => c.startsWith("bdr_session="))?.split(";")[0],
  };
}
async function newUser(plan = "FREE") {
  const email = `usagetest-${RUN}-${++n}@example.test`;
  const r = await call("/api/auth/register", { body: { email, password: `pw-${randomUUID()}` } });
  assert.equal(r.status, 201);
  if (plan !== "FREE") await sql(`UPDATE "User" SET "subscriptionStatus" = $1 WHERE id = $2`, [plan, r.body.data.id]);
  return { id: r.body.data.id, cookie: r.cookie };
}
const view = (u, jobId, body) => call(`/api/jobs/${jobId}/view`, { cookie: u?.cookie, body });
const apply = (u, jobId, body) => call(`/api/jobs/${jobId}/apply`, { cookie: u?.cookie, body });
const detail = (u, jobId, opts = {}) => call(`/api/jobs/${jobId}`, { method: "GET", cookie: u?.cookie, ...opts });
const usage = (u) => call("/api/me/usage", { method: "GET", cookie: u?.cookie });
const dbCount = async (table, userId) =>
  (await sql(`SELECT count(*)::int AS c FROM "${table}" WHERE "userId" = $1`, [userId]))[0].c;
const code = (r) => r.body.error?.code;

// ---- views ----
test("view: 401 without session, 400 bad id, 404 missing job", async () => {
  const u = await newUser();
  const r1 = await view(undefined, jobs[0].id);
  assert.equal(r1.status, 401);
  assert.equal(code(r1), "UNAUTHENTICATED");
  for (const bad of ["abc", "0", "-1", "1.5", "99999999999"]) {
    const r = await view(u, bad);
    assert.equal(r.status, 400, bad);
    assert.equal(code(r), "INVALID_JOB_ID");
  }
  const r2 = await view(u, 2_000_000_000);
  assert.equal(r2.status, 404);
  assert.equal(code(r2), "JOB_NOT_FOUND");
  assert.equal(await dbCount("JobView", u.id), 0);
});

test("view: first view creates one row, repeat creates none", async () => {
  const u = await newUser();
  const a = await view(u, jobs[0].id);
  assert.deepEqual([a.status, a.body], [200, { success: true, viewed: true, alreadyViewed: false }]);
  const b = await view(u, jobs[0].id);
  assert.deepEqual([b.status, b.body], [200, { success: true, viewed: true, alreadyViewed: true }]);
  assert.equal(await dbCount("JobView", u.id), 1);
});

test("view: FREE gets 10 unique, 11th is 429, old job stays viewable, no extra row", async () => {
  const u = await newUser();
  for (let i = 0; i < 10; i++) assert.equal((await view(u, jobs[i].id)).status, 200);
  const over = await view(u, jobs[10].id);
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: { code: "VIEW_LIMIT_REACHED", message: "You have reached your free job-view limit." } });
  const again = await view(u, jobs[3].id);
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyViewed, true);
  assert.equal(await dbCount("JobView", u.id), 10);
  assert.deepEqual((await usage(u)).body.data.jobViews, { used: 10, limit: 10, remaining: 0, unlimited: false });
});

test("view: PRO can view more than 10 unique jobs", async () => {
  const u = await newUser("PRO");
  for (let i = 0; i < 12; i++) assert.equal((await view(u, jobs[i].id)).status, 200);
  assert.equal(await dbCount("JobView", u.id), 12);
  assert.deepEqual((await usage(u)).body.data.jobViews, { used: 12, limit: null, remaining: null, unlimited: true });
});

test("view: users are counted separately", async () => {
  const a = await newUser();
  const b = await newUser();
  await view(a, jobs[0].id);
  assert.equal((await view(b, jobs[0].id)).body.alreadyViewed, false);
  assert.equal((await usage(b)).body.data.jobViews.used, 1);
});

test("view/apply: client-supplied userId and plan are ignored", async () => {
  const a = await newUser();
  const other = await newUser();
  const body = { userId: other.id, subscriptionStatus: "PRO", plan: "PRO" };
  for (let i = 0; i < 10; i++) await view(a, jobs[i].id, body);
  assert.equal((await view(a, jobs[10].id, body)).status, 429, "FREE user cannot self-upgrade");
  assert.equal(await dbCount("JobView", other.id), 0, "other user untouched");
  for (let i = 0; i < 3; i++) assert.equal((await apply(a, jobs[0].id, body)).status, 200);
  assert.equal((await apply(a, jobs[0].id, body)).status, 429);
  assert.equal(await dbCount("ApplyClick", other.id), 0);
  assert.equal((await usage(a)).body.data.subscriptionStatus, "FREE");
});

// ---- GET /api/jobs/:id enforces the same view quota ----
test("detail: 401 without session, 400 bad id, 404 missing job; no row created", async () => {
  const u = await newUser();
  const r1 = await detail(undefined, jobs[0].id);
  assert.equal(r1.status, 401);
  assert.equal(code(r1), "UNAUTHENTICATED");
  assert.equal((await detail(u, "abc")).status, 400);
  const r2 = await detail(u, 2_000_000_000);
  assert.deepEqual([r2.status, code(r2)], [404, "JOB_NOT_FOUND"]);
  assert.equal(await dbCount("JobView", u.id), 0);
});

test("detail: first view returns full job and records one row; repeat adds none", async () => {
  const u = await newUser();
  const a = await detail(u, jobs[0].id);
  assert.equal(a.status, 200);
  assert.equal(a.body.data.sourceUrl, jobs[0].sourceUrl);
  assert.equal(typeof a.body.data.description, "string");
  assert.equal(await dbCount("JobView", u.id), 1);
  assert.equal((await detail(u, jobs[0].id)).status, 200);
  assert.equal(await dbCount("JobView", u.id), 1);
});

test("detail: FREE gets 10 unique, 11th is 429 with no data, revisit still 200", async () => {
  const u = await newUser();
  for (let i = 0; i < 10; i++) assert.equal((await detail(u, jobs[i].id)).status, 200);
  const over = await detail(u, jobs[10].id);
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: { code: "VIEW_LIMIT_REACHED", message: "You have reached your free job-view limit." } });
  assert.equal(await dbCount("JobView", u.id), 10);
  assert.equal((await detail(u, jobs[4].id)).status, 200);
  assert.equal((await view(u, jobs[4].id)).body.alreadyViewed, true, "POST view agrees with GET detail");
  assert.equal((await view(u, jobs[11].id)).status, 429);
  assert.equal(await dbCount("JobView", u.id), 10);
});

test("detail: POST view then GET detail of the same job costs one view", async () => {
  const u = await newUser();
  await view(u, jobs[0].id);
  assert.equal((await detail(u, jobs[0].id)).status, 200);
  assert.equal(await dbCount("JobView", u.id), 1);
});

test("detail: PRO views 12 unique jobs, all tracked", async () => {
  const u = await newUser("PRO");
  for (let i = 0; i < 12; i++) assert.equal((await detail(u, jobs[i].id)).status, 200);
  assert.equal(await dbCount("JobView", u.id), 12);
  assert.deepEqual((await usage(u)).body.data.jobViews, { used: 12, limit: null, remaining: null, unlimited: true });
});

test("detail: client-supplied userId/plan (query, headers) cannot change identity or plan; other user's quota untouched", async () => {
  const a = await newUser();
  const other = await newUser();
  const spoof = { headers: { "x-user-id": String(other.id), "x-subscription-status": "PRO" } };
  for (let i = 0; i < 10; i++) await call(`/api/jobs/${jobs[i].id}?userId=${other.id}&subscriptionStatus=PRO`, { method: "GET", cookie: a.cookie, ...spoof });
  const over = await call(`/api/jobs/${jobs[10].id}?userId=${other.id}&subscriptionStatus=PRO&plan=PRO`, { method: "GET", cookie: a.cookie, ...spoof });
  assert.equal(over.status, 429, "FREE user cannot self-upgrade");
  assert.equal(await dbCount("JobView", other.id), 0);
  assert.equal(await dbCount("JobView", a.id), 10);
});

test("detail: unknown stored plan fails closed (403, no row)", async () => {
  const u = await newUser();
  await sql(`UPDATE "User" SET "subscriptionStatus" = 'GOLD' WHERE id = $1`, [u.id]);
  assert.equal((await detail(u, jobs[0].id)).status, 403);
  assert.equal(await dbCount("JobView", u.id), 0);
});

test("detail: forged session cookie -> 401", async () => {
  assert.equal((await detail({ cookie: "bdr_session=not-a-real-token" }, jobs[0].id)).status, 401);
});

test("list: public, summary only (no description / sourceUrl)", async () => {
  const r = await call("/api/jobs", { method: "GET" });
  assert.equal(r.status, 200);
  for (const j of r.body.data) assert.ok(!("description" in j) && !("sourceUrl" in j));
});

// ---- apply ----
test("apply: 401, 400, 404", async () => {
  const u = await newUser();
  assert.equal((await apply(undefined, jobs[0].id)).status, 401);
  assert.equal((await apply(u, "abc")).status, 400);
  const r = await apply(u, 2_000_000_000);
  assert.equal(r.status, 404);
  assert.equal(code(r), "JOB_NOT_FOUND");
  assert.equal(await dbCount("ApplyClick", u.id), 0);
});

test("apply: job without a valid URL -> 422, no event", async () => {
  const u = await newUser();
  const [row] = await sql(
    `INSERT INTO "Job" (title, organization, sector, category, location, description, "sourceId", "sourceUrl")
     SELECT 'usagetest-bad-url', 'x', 'x', 'x', 'x', 'x', id, 'not a url' FROM "JobSource" LIMIT 1 RETURNING id`,
  );
  try {
    const r = await apply(u, row.id);
    assert.equal(r.status, 422);
    assert.equal(code(r), "APPLY_URL_UNAVAILABLE");
    assert.equal(await dbCount("ApplyClick", u.id), 0);
  } finally {
    await sql(`DELETE FROM "Job" WHERE id = $1`, [row.id]);
  }
});

test("apply: FREE 3 clicks (same job counts each time), 4th is 429 with no event, real source URL returned", async () => {
  const u = await newUser();
  for (const remaining of [2, 1, 0]) {
    const r = await apply(u, jobs[0].id, { applyUrl: "https://evil.example", url: "https://evil.example" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, applyUrl: jobs[0].sourceUrl, remaining });
  }
  const over = await apply(u, jobs[1].id);
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: { code: "APPLY_LIMIT_REACHED", message: "You have reached your free Apply-click limit." } });
  assert.equal(await dbCount("ApplyClick", u.id), 3);
  assert.deepEqual((await usage(u)).body.data.applyClicks, { used: 3, limit: 3, remaining: 0, unlimited: false });
});

test("apply: PRO exceeds 3, remaining null", async () => {
  const u = await newUser("PRO");
  for (let i = 0; i < 5; i++) {
    const r = await apply(u, jobs[0].id);
    assert.equal(r.status, 200);
    assert.equal(r.body.remaining, null);
  }
  assert.equal(await dbCount("ApplyClick", u.id), 5);
});

test("usage: 401 anonymous; FREE shape", async () => {
  assert.equal((await usage(undefined)).status, 401);
  const u = await newUser();
  await view(u, jobs[0].id);
  await apply(u, jobs[0].id);
  assert.deepEqual((await usage(u)).body, {
    success: true,
    data: {
      subscriptionStatus: "FREE",
      jobViews: { used: 1, limit: 10, remaining: 9, unlimited: false },
      applyClicks: { used: 1, limit: 3, remaining: 2, unlimited: false },
    },
  });
});

test("usage: unknown stored plan fails closed (403, no access)", async () => {
  const u = await newUser();
  await sql(`UPDATE "User" SET "subscriptionStatus" = 'GOLD' WHERE id = $1`, [u.id]);
  assert.equal((await usage(u)).status, 403);
  assert.equal((await view(u, jobs[0].id)).status, 403);
  assert.equal((await apply(u, jobs[0].id)).status, 403);
  assert.equal((await dbCount("JobView", u.id)) + (await dbCount("ApplyClick", u.id)), 0);
});

// ---- concurrency (real simultaneous HTTP requests; verified in the database) ----
test("concurrency: two simultaneous views of the SAME new job -> one row", async () => {
  const u = await newUser();
  const rs = await Promise.all([view(u, jobs[0].id), view(u, jobs[0].id)]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200]);
  assert.equal(rs.filter((r) => r.body.alreadyViewed === false).length, 1);
  assert.equal(await dbCount("JobView", u.id), 1);
});

test("concurrency: one view left, two simultaneous DIFFERENT jobs -> exactly one succeeds", async () => {
  const u = await newUser();
  for (let i = 0; i < 9; i++) await view(u, jobs[i].id);
  const rs = await Promise.all([view(u, jobs[10].id), view(u, jobs[11].id)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 429]);
  assert.equal(await dbCount("JobView", u.id), 10);
});

test("concurrency: one Apply click left, two simultaneous applies -> exactly one succeeds", async () => {
  const u = await newUser();
  for (let i = 0; i < 2; i++) await apply(u, jobs[0].id);
  const rs = await Promise.all([apply(u, jobs[0].id), apply(u, jobs[1].id)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 429]);
  assert.equal(await dbCount("ApplyClick", u.id), 3);
});

test("concurrency: 8 simultaneous applies with 3 allowed -> exactly 3 succeed", async () => {
  const u = await newUser();
  const rs = await Promise.all(Array.from({ length: 8 }, () => apply(u, jobs[0].id)));
  assert.equal(rs.filter((r) => r.status === 200).length, 3);
  assert.equal(rs.filter((r) => r.status === 429).length, 5);
  assert.equal(await dbCount("ApplyClick", u.id), 3);
});

test("concurrency: 12 simultaneous GET details of 12 different jobs -> FREE gets exactly 10", async () => {
  const u = await newUser();
  const rs = await Promise.all(jobs.slice(0, 12).map((j) => detail(u, j.id)));
  assert.equal(rs.filter((r) => r.status === 200).length, 10);
  assert.equal(rs.filter((r) => r.status === 429).length, 2);
  assert.equal(await dbCount("JobView", u.id), 10);
});

test("concurrency: mixed GET detail + POST view of the same new job -> one row", async () => {
  const u = await newUser();
  const rs = await Promise.all([detail(u, jobs[0].id), view(u, jobs[0].id), detail(u, jobs[0].id)]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200]);
  assert.equal(await dbCount("JobView", u.id), 1);
});

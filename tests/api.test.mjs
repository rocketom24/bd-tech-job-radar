// HTTP integration tests. Run a dev server first (npm run dev), then: npm run test:api
// Target: BASE_URL (default http://localhost:3000). Needs the seeded dev database. The job-detail endpoint needs a login,
// so these tests register one PRO user (apitest-*@example.test, deleted in after(); its JobView rows cascade).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LIST_KEYS = ["category", "createdAt", "deadline", "experience", "id", "location", "organization", "salary", "salaryCurrency", "salaryDisclosure", "salaryMax", "salaryMin", "salaryPeriod", "sector", "skills", "sourceId", "title", "verified"];
const JOB_KEYS = ["category", "createdAt", "deadline", "description", "experience", "id", "location", "organization", "salary", "salaryCurrency", "salaryDisclosure", "salaryMax", "salaryMin", "salaryPeriod", "sector", "skills", "sourceId", "sourceUrl", "title", "verified"];
const SOURCE_KEYS = ["id", "name", "type", "url"];

const sql = neon(process.env.DATABASE_URL).query;
const STARTED = new Date().toISOString();
const EMAIL = `apitest-${randomUUID().slice(0, 8)}@example.test`;
let cookie;
before(async () => {
  const r = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" }, body: JSON.stringify({ email: EMAIL, password: "correct horse battery" }) });
  assert.equal(r.status, 201);
  cookie = r.headers.getSetCookie().find((c) => c.startsWith("bdr_session="))?.split(";")[0];
  await sql(`UPDATE "User" SET "subscriptionStatus" = 'PRO' WHERE email = $1`, [EMAIL]);
});
after(async () => {
  await sql(`DELETE FROM "User" WHERE email = $1`, [EMAIL]);
  await sql(`DELETE FROM "RateLimit" WHERE "windowStart" >= $1::timestamptz - interval '1 hour' AND key LIKE ANY (ARRAY['register:%', 'view:%'])`, [STARTED]);
});

async function get(path, { auth = false } = {}) {
  const res = await fetch(BASE + path, auth ? { headers: { cookie } } : undefined);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { assert.fail(`${path}: non-JSON response (${res.status}): ${text.slice(0, 200)}`); }
  assert.match(res.headers.get("content-type") ?? "", /application\/json/, `${path}: content-type`);
  return { status: res.status, body };
}
const keys = (o) => Object.keys(o).sort();
const jobs = async (qs = "") => { const r = await get("/api/jobs" + qs); assert.equal(r.status, 200, `${qs}: ${JSON.stringify(r.body)}`); return r.body.data; };
const assertError = (r, status) => {
  assert.equal(r.status, status);
  assert.deepEqual(Object.keys(r.body), ["error"]);
  assert.equal(typeof r.body.error.message, "string");
};

test("GET /api/jobs baseline", async () => {
  const r = await get("/api/jobs");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.equal(r.body.data.length, 25);
  for (const j of r.body.data) assert.deepEqual(keys(j), LIST_KEYS, "list is summary-only: no description/sourceUrl");
  const times = r.body.data.map((j) => Date.parse(j.createdAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "createdAt DESC");
});

const filterCases = [
  ["?keyword=django", 1],
  ["?location=remote", 4],
  ["?category=qa", 2],
  ["?keyword=bank&location=Dhaka&category=Data", 1],
  ["?keyword=kubernetes", 0], // skills are not searched
  ["?keyword=DJANGO", 1], // case-insensitive
  ["?keyword=jang", 1], // partial
  ["?location=hak", 10 > 0 ? undefined : 0], // partial location, count checked below
  ["?keyword=%20%20django%20%20", 1], // trimmed
  ["?keyword=%20%20%20", 25], // whitespace-only ignored
  ["?keyword=", 25],
  ["?foo=bar", 25], // unknown params ignored
  ["?category=Soft", 0], // category is exact, not partial
  ["?keyword=zzzznomatch", 0],
  ["?keyword=%25", 0], // literal %, not wildcard
  ["?keyword=_", 0], // literal _, not wildcard
  ["?keyword=D_ango", 0],
  ["?keyword=%25jango", 0],
  ["?location=%25", 0],
  ["?location=R_mote", 0],
  ["?category=_a", 0],
  ["?category=%25", 0],
  ["?keyword=%5C", 0], // literal backslash
  ["?location=%5C", 0],
  ["?category=%5C", 0],
  ["?keyword=a%5C%25_b", 0], // backslash + % + _ together
];
for (const [qs, count] of filterCases) {
  test(`GET /api/jobs${qs}`, async () => {
    const data = await jobs(qs);
    if (count === undefined) assert.ok(data.length > 0 && data.length < 25);
    else assert.equal(data.length, count);
  });
}

test("filters combine with AND", async () => {
  const all = await jobs("?location=dhaka");
  const both = await jobs("?location=dhaka&category=data");
  assert.ok(both.length > 0 && both.length < all.length);
  assert.ok(both.every((j) => /dhaka/i.test(j.location) && j.category.toLowerCase() === "data"));
});

test("filtered results stay newest first", async () => {
  const data = await jobs("?category=software");
  const t = data.map((j) => Date.parse(j.createdAt));
  assert.deepEqual(t, [...t].sort((a, b) => b - a));
});

for (const [name, qs] of [
  ["repeated keyword", "?keyword=a&keyword=b"],
  ["repeated location", "?location=a&location=b"],
  ["keyword 101 chars", "?keyword=" + "a".repeat(101)],
  ["location 101 chars", "?location=" + "a".repeat(101)],
  ["category 51 chars", "?category=" + "a".repeat(51)],
  ["NUL in keyword", "?keyword=a%00b"],
  ["NUL in location", "?location=%00"],
  ["NUL in category", "?category=%00"],
]) {
  test(`400: ${name}`, async () => assertError(await get("/api/jobs" + qs), 400));
}
test("max-length values accepted", async () => {
  assert.equal((await jobs("?keyword=" + "a".repeat(100))).length, 0);
  assert.equal((await jobs("?category=" + "a".repeat(50))).length, 0);
});

test("GET /api/jobs/13", async () => {
  const r = await get("/api/jobs/13", { auth: true });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.deepEqual(keys(r.body.data), [...JOB_KEYS, "source"].sort());
  assert.equal(r.body.data.id, 13);
  assert.deepEqual(keys(r.body.data.source), SOURCE_KEYS);
  assert.equal(r.body.data.source.id, r.body.data.sourceId);
});

test("GET /api/jobs/9999 -> 404", async () => {
  const r = await get("/api/jobs/9999", { auth: true });
  assertError(r, 404);
  assert.equal(r.body.error.message, "Job not found");
});
for (const id of ["abc", "0", "-1", "1.5", "04", "1e3", "2147483648", "99999999999999999999", "%20", "0x10"]) {
  test(`GET /api/jobs/${id} -> 400`, async () => assertError(await get("/api/jobs/" + id, { auth: true }), 400));
}
test("GET /api/jobs/2147483647 -> 404 (max INT4 is valid)", async () => assertError(await get("/api/jobs/2147483647", { auth: true }), 404));

test("GET /api/sources", async () => {
  const r = await get("/api/sources");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.equal(r.body.data.length, 5);
  for (const s of r.body.data) assert.deepEqual(keys(s), SOURCE_KEYS);
  const names = r.body.data.map((s) => s.name);
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

// ---- Structured salary (seed is demonstration data; see prisma/seed.ts) ----
// sourceUrl is not in the list response any more; read it straight from the database to key jobs by slug.
const bySlug = async () => {
  const urls = new Map((await sql(`SELECT id, "sourceUrl" FROM "Job"`)).map((r) => [r.id, r.sourceUrl]));
  return new Map((await jobs()).map((j) => [urls.get(j.id).split("/").pop(), j]));
};
const SAL = ["salaryMin", "salaryMax", "salaryCurrency", "salaryPeriod", "salaryDisclosure"];

test("legacy jobs: structured salary fields are all null, legacy text kept", async () => {
  const m = await bySlug();
  for (const slug of ["devops-engineer-opsforge", "it-officer-demo-bank", "software-engineer-appnest"]) {
    const j = m.get(slug);
    for (const k of SAL) assert.equal(j[k], null, `${slug}.${k}`);
    assert.match(j.salary, /^Tk /);
  }
});
test("disclosed BDT monthly range; Decimal serialized as string; legacy text unchanged", async () => {
  const j = (await bySlug()).get("backend-developer-nodecraft");
  assert.deepEqual(SAL.map((k) => j[k]), ["70000", "110000", "BDT", "MONTHLY", "DISCLOSED"]);
  assert.equal(typeof j.salaryMin, "string");
  assert.equal(j.salary, "Tk 70,000 - 110,000");
});
test("government grade numbers are not parsed as amounts", async () => {
  const j = (await bySlug()).get("it-officer-ministry");
  assert.deepEqual([j.salaryMin, j.salaryMax], ["35500", "67010"]);
});
test("USD hourly, USD monthly and EUR yearly", async () => {
  const m = await bySlug();
  assert.deepEqual(SAL.map((k) => m.get("data-analyst-insightly")[k]), ["15", "25", "USD", "HOURLY", "DISCLOSED"]);
  assert.deepEqual(SAL.map((k) => m.get("backend-developer-pyroute")[k]), ["2000", "3200", "USD", "MONTHLY", "DISCLOSED"]);
  assert.deepEqual(SAL.map((k) => m.get("fullstack-developer-cloudlane")[k]), ["28000", "42000", "EUR", "YEARLY", "DISCLOSED"]);
});
test("negotiable and not-disclosed carry no amounts or currency", async () => {
  const m = await bySlug();
  for (const [slug, d] of [["qa-engineer-testbridge", "NEGOTIABLE"], ["assistant-programmer-bytenest", "NOT_DISCLOSED"]]) {
    const j = m.get(slug);
    assert.deepEqual([j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryDisclosure], [null, null, null, d]);
  }
});
test("seeded salary data covers every currency, period and disclosure", async () => {
  const all = [...(await bySlug()).values()];
  const seen = (k) => new Set(all.map((j) => j[k]));
  for (const v of ["BDT", "USD", "EUR"]) assert.ok(seen("salaryCurrency").has(v), v);
  for (const v of ["MONTHLY", "YEARLY", "HOURLY"]) assert.ok(seen("salaryPeriod").has(v), v);
  for (const v of ["DISCLOSED", "NEGOTIABLE", "NOT_DISCLOSED", null]) assert.ok(seen("salaryDisclosure").has(v), String(v));
});
test("every seeded job satisfies the documented salary invariants", async () => {
  for (const j of await jobs()) {
    const hasAmt = j.salaryMin !== null || j.salaryMax !== null;
    if (j.salaryMin !== null && j.salaryMax !== null) assert.ok(Number(j.salaryMin) <= Number(j.salaryMax), j.id);
    if (j.salaryDisclosure === "DISCLOSED") assert.ok(hasAmt && j.salaryCurrency && j.salaryPeriod, j.id);
    else if (j.salaryDisclosure !== null) assert.ok(!hasAmt && j.salaryCurrency === null, j.id);
    else assert.ok(SAL.every((k) => j[k] === null), j.id);
    if (j.salaryCurrency !== null) assert.match(j.salaryCurrency, /^[A-Z]{3}$/);
  }
});
test("detail endpoint returns the same salary fields as the list", async () => {
  const list = (await bySlug()).get("data-analyst-insightly");
  const d = (await get("/api/jobs/" + list.id, { auth: true })).body.data;
  for (const k of SAL) assert.equal(d[k], list[k], k);
});

test("GET /api/jobs/:id requires a session (401, even for bad or missing ids)", async () => {
  for (const id of ["13", "abc", "9999"]) {
    const r = await get("/api/jobs/" + id);
    assertError(r, 401);
    assert.equal(r.body.error.code, "UNAUTHENTICATED");
  }
});

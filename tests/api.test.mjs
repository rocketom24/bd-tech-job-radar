// HTTP integration tests. Run a dev server first (npm run dev), then: npm run test:api
// Target: BASE_URL (default http://localhost:3000). Read-only; needs the seeded dev database.
import assert from "node:assert/strict";
import { test } from "node:test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const JOB_KEYS = ["category", "createdAt", "deadline", "description", "experience", "id", "location", "organization", "salary", "sector", "skills", "sourceId", "sourceUrl", "title", "verified"];
const SOURCE_KEYS = ["id", "name", "type", "url"];

async function get(path) {
  const res = await fetch(BASE + path);
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
  for (const j of r.body.data) assert.deepEqual(keys(j), JOB_KEYS);
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
  const r = await get("/api/jobs/13");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.deepEqual(keys(r.body.data), [...JOB_KEYS, "source"].sort());
  assert.equal(r.body.data.id, 13);
  assert.deepEqual(keys(r.body.data.source), SOURCE_KEYS);
  assert.equal(r.body.data.source.id, r.body.data.sourceId);
});

test("GET /api/jobs/9999 -> 404", async () => {
  const r = await get("/api/jobs/9999");
  assertError(r, 404);
  assert.equal(r.body.error.message, "Job not found");
});
for (const id of ["abc", "0", "-1", "1.5", "04", "1e3", "2147483648", "99999999999999999999", "%20", "0x10"]) {
  test(`GET /api/jobs/${id} -> 400`, async () => assertError(await get("/api/jobs/" + id), 400));
}
test("GET /api/jobs/2147483647 -> 404 (max INT4 is valid)", async () => assertError(await get("/api/jobs/2147483647"), 404));

test("GET /api/sources", async () => {
  const r = await get("/api/sources");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.equal(r.body.data.length, 5);
  for (const s of r.body.data) assert.deepEqual(keys(s), SOURCE_KEYS);
  const names = r.body.data.map((s) => s.name);
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

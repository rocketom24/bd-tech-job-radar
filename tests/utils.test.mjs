// Pure helper tests for lib/utils.ts (no server, no database): node --test tests/utils.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { deadlineParts, formatDeadline, initials, safeNext, salaryParts } from "../lib/utils.ts";

// ---------- safeNext ----------
test("safeNext keeps same-site paths, query and hash", () => {
  assert.equal(safeNext("/jobs/4"), "/jobs/4");
  assert.equal(safeNext("/jobs/4?a=1#x"), "/jobs/4?a=1#x");
  assert.equal(safeNext("/"), "/");
});
test("safeNext rejects other origins and schemes", () => {
  for (const v of ["//evil.com", "https://evil.com", "http://evil.com/jobs", "javascript:alert(1)", "evil.com", "jobs/4", "///evil.com"]) {
    assert.equal(safeNext(v), "/", v);
  }
});
test("safeNext rejects backslashes, tabs, newlines and other control chars", () => {
  for (const v of ["/\\evil.com", "\\\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/jobs/\u0000", "/jobs\u007F"]) {
    assert.equal(safeNext(v), "/", JSON.stringify(v));
  }
});
test("safeNext rejects dot segments that normalise to a protocol-relative path", () => {
  for (const v of ["/./evil.com/..//evil.com", "/a/../..//evil.com", "/.//evil.com", "/%2e//evil.com"]) {
    const out = safeNext(v);
    assert.ok(!out.startsWith("//"), `${v} -> ${out}`);
  }
});
test("safeNext treats empty and null as home", () => {
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext(null), "/");
});

// ---------- deadlines ----------
const NOW = Date.parse("2026-11-07T15:30:00Z"); // mid-afternoon UTC
const day = (iso) => `${iso}T00:00:00.000Z`; // how the API serialises seeded deadlines

test("deadline: no deadline is open", () => {
  assert.deepEqual(formatDeadline(null, NOW), { label: "No deadline", tone: "none" });
  assert.equal(deadlineParts(null, NOW), null);
  assert.deepEqual(formatDeadline("not a date", NOW), { label: "No deadline", tone: "none" });
  assert.equal(deadlineParts("not a date", NOW), null);
});
test("deadline: today, tomorrow and the 7-day boundary are closing soon", () => {
  assert.deepEqual(formatDeadline(day("2026-11-07"), NOW), { label: "Closes today", tone: "soon" });
  assert.deepEqual(formatDeadline(day("2026-11-08"), NOW), { label: "1 day left · 8 Nov 2026", tone: "soon" });
  assert.deepEqual(formatDeadline(day("2026-11-09"), NOW), { label: "2 days left · 9 Nov 2026", tone: "soon" });
  assert.deepEqual(formatDeadline(day("2026-11-14"), NOW), { label: "7 days left · 14 Nov 2026", tone: "soon" });
});
test("deadline: 8 days out is open, not closing soon", () => {
  assert.deepEqual(formatDeadline(day("2026-11-15"), NOW), { label: "15 Nov 2026", tone: "ok" });
  assert.equal(deadlineParts(day("2026-11-15"), NOW).days, 8);
});
test("deadline: yesterday is closed", () => {
  assert.deepEqual(formatDeadline(day("2026-11-06"), NOW), { label: "Closed 6 Nov 2026", tone: "past" });
  assert.equal(deadlineParts(day("2026-11-06"), NOW).days, -1);
});
test("deadline: day boundaries are UTC calendar days, independent of time of day", () => {
  // first and last millisecond of the same UTC day agree
  assert.equal(formatDeadline(day("2026-11-08"), Date.parse("2026-11-07T00:00:00.000Z")).label, "1 day left · 8 Nov 2026");
  assert.equal(formatDeadline(day("2026-11-08"), Date.parse("2026-11-07T23:59:59.999Z")).label, "1 day left · 8 Nov 2026");
  assert.equal(formatDeadline(day("2026-11-07"), Date.parse("2026-11-08T00:00:00.000Z")).tone, "past");
  // a deadline carrying a time of day still counts by its calendar day (no rounding up to the next day)
  assert.equal(deadlineParts("2026-11-08T18:00:00Z", NOW).days, 1);
  assert.equal(formatDeadline("2026-11-07T23:00:00Z", NOW).label, "Closes today");
  // a non-UTC offset is read as the UTC instant it names
  assert.equal(deadlineParts("2026-11-09T02:00:00+06:00", NOW).day, "8");
});
test("deadline: calendar parts use the UTC date, whatever the host time zone", () => {
  assert.deepEqual(deadlineParts(day("2027-01-05"), NOW), { day: "5", month: "Jan", year: "2027", date: "5 Jan 2027", days: 59 });
  assert.deepEqual(deadlineParts(day("2026-12-31"), NOW), { day: "31", month: "Dec", year: "2026", date: "31 Dec 2026", days: 54 });
});
test("deadline: stub and label agree on every day from -3 to +10", () => {
  for (let d = -3; d <= 10; d++) {
    const iso = new Date(Date.UTC(2026, 10, 7 + d)).toISOString();
    const { tone } = formatDeadline(iso, NOW);
    assert.equal(deadlineParts(iso, NOW).days, d);
    assert.equal(tone, d < 0 ? "past" : d <= 7 ? "soon" : "ok", `day ${d}`);
  }
});

// ---------- salary ----------
const job = (o) => ({ salary: null, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salaryDisclosure: null, ...o });
const disclosed = { salaryDisclosure: "DISCLOSED", salaryCurrency: "BDT", salaryPeriod: "MONTHLY" };

test("salary: structured range, single amount, open-ended", () => {
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryMin: "55000", salaryMax: "90000" })), { amount: "Tk 55,000 – 90,000", period: "month" });
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryMin: "60000", salaryMax: "60000" })), { amount: "Tk 60,000", period: "month" });
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryMin: "60000" })), { amount: "From Tk 60,000", period: "month" });
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryMax: "60000" })), { amount: "Up to Tk 60,000", period: "month" });
});
test("salary: other currencies and periods", () => {
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryCurrency: "USD", salaryPeriod: "YEARLY", salaryMin: "40000.5", salaryMax: "50000" })), { amount: "USD 40,000.5 – 50,000", period: "year" });
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryPeriod: "HOURLY", salaryMin: "500" })).period, "hour");
  assert.deepEqual(salaryParts(job({ ...disclosed, salaryPeriod: null, salaryMin: "500", salaryMax: "900" })), { amount: "Tk 500 – 900", period: null });
});
test("salary: legacy text when no structured data", () => {
  assert.deepEqual(salaryParts(job({ salary: "Tk 35,500 - 67,010" })), { amount: "Tk 35,500 - 67,010", period: null });
  assert.deepEqual(salaryParts(job({ salary: "   " })), { amount: "Not listed", period: null });
  assert.deepEqual(salaryParts(job({})), { amount: "Not listed", period: null });
  // DISCLOSED without usable amounts falls back to the legacy text
  assert.deepEqual(salaryParts(job({ ...disclosed, salary: "Tk 1 - 2", salaryMin: "-5", salaryMax: "abc" })), { amount: "Tk 1 - 2", period: null });
});
test("salary: negotiable and undisclosed ignore any amounts", () => {
  assert.deepEqual(salaryParts(job({ salaryDisclosure: "NEGOTIABLE", salaryMin: "1000" })), { amount: "Negotiable", period: null });
  assert.deepEqual(salaryParts(job({ salaryDisclosure: "NOT_DISCLOSED", salary: "Tk 5" })), { amount: "Not disclosed", period: null });
});

// ---------- initials ----------
test("initials come from the email local part, letters only", () => {
  assert.equal(initials("john.doe@example.com"), "JD");
  assert.equal(initials("maria2500@example.com"), "M");
  assert.equal(initials("user-1700000000000@example.com"), "U");
  assert.equal(initials("a_b_c@x.io"), "AB");
  assert.equal(initials("1234@x.io"), "1");
});

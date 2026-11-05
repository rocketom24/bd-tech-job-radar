// Pure schema tests for salarySchema (no server, no database): node --test tests/schemas.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { salarySchema } from "../lib/schemas.ts";

const ok = (v) => assert.equal(salarySchema.safeParse(v).success, true, JSON.stringify(salarySchema.safeParse(v).error?.issues));
const bad = (v, path) => {
  const r = salarySchema.safeParse(v);
  assert.equal(r.success, false, `expected failure: ${JSON.stringify(v)}`);
  if (path) assert.ok(r.error.issues.some((i) => i.path[0] === path), `no issue on ${path}: ${JSON.stringify(r.error.issues)}`);
};
const disclosed = { salaryMin: 1000, salaryMax: 2000, salaryCurrency: "BDT", salaryPeriod: "MONTHLY", salaryDisclosure: "DISCLOSED" };

test("legacy: empty object and explicit nulls are valid", () => {
  ok({});
  ok({ salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salaryDisclosure: null });
});
test("legacy: partial structured data without disclosure is rejected", () => {
  bad({ salaryMin: 100 }, "salaryDisclosure");
  bad({ salaryPeriod: "MONTHLY" }, "salaryDisclosure");
  bad({ salaryCurrency: "USD" }, "salaryDisclosure");
});
test("disclosed: min+max, min only, max only", () => {
  ok(disclosed);
  ok({ ...disclosed, salaryMax: null });
  ok({ ...disclosed, salaryMin: null });
  ok({ ...disclosed, salaryMin: 1000, salaryMax: 1000 });
});
test("disclosed: every currency and period", () => {
  for (const salaryCurrency of ["BDT", "USD", "EUR"]) ok({ ...disclosed, salaryCurrency });
  for (const salaryPeriod of ["MONTHLY", "YEARLY", "HOURLY"]) ok({ ...disclosed, salaryPeriod });
});
test("disclosed: missing amount, currency or period", () => {
  bad({ ...disclosed, salaryMin: null, salaryMax: null }, "salaryMin");
  bad({ ...disclosed, salaryCurrency: null }, "salaryCurrency");
  bad({ ...disclosed, salaryPeriod: null }, "salaryPeriod");
});
test("negative amounts", () => {
  bad({ ...disclosed, salaryMin: -1 }, "salaryMin");
  bad({ ...disclosed, salaryMax: -0.01 }, "salaryMax");
});
test("min greater than max", () => bad({ ...disclosed, salaryMin: 2001, salaryMax: 2000 }, "salaryMin"));
test("invalid currency", () => {
  for (const salaryCurrency of ["usd", "US", "USDX", "U$D", "", "123"]) bad({ ...disclosed, salaryCurrency }, "salaryCurrency");
});
test("invalid period and disclosure", () => {
  bad({ ...disclosed, salaryPeriod: "WEEKLY" }, "salaryPeriod");
  bad({ ...disclosed, salaryDisclosure: "SECRET" }, "salaryDisclosure");
});
test("amount precision and range", () => {
  ok({ ...disclosed, salaryMax: 1234.56 });
  bad({ ...disclosed, salaryMax: 10.001 }, "salaryMax");
  bad({ ...disclosed, salaryMax: 10_000_000_000 }, "salaryMax");
  bad({ ...disclosed, salaryMax: "1000" }, "salaryMax");
});
test("negotiable / not disclosed: no amounts or currency", () => {
  for (const salaryDisclosure of ["NEGOTIABLE", "NOT_DISCLOSED"]) {
    ok({ salaryDisclosure });
    ok({ salaryDisclosure, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null });
    bad({ salaryDisclosure, salaryMin: 1 }, "salaryMin");
    bad({ salaryDisclosure, salaryMax: 1 }, "salaryMin");
    bad({ salaryDisclosure, salaryCurrency: "BDT" }, "salaryCurrency");
  }
});

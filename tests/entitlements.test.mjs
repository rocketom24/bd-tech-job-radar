// Pure entitlement tests (no server, no database): node --test tests/entitlements.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_LIMITS, getEntitlements, isSubscriptionStatus } from "../lib/entitlements.ts";

const u = (jobViews, applyClicks) => ({ jobViews, applyClicks });

test("constants match the business rules", () => {
  assert.deepEqual(PLAN_LIMITS.FREE, { jobViews: 10, applyClicks: 3 });
  assert.deepEqual(PLAN_LIMITS.PRO, { jobViews: null, applyClicks: null });
});

test("FREE: zero usage", () => {
  assert.deepEqual(getEntitlements("FREE", u(0, 0)), {
    subscriptionStatus: "FREE",
    jobViews: { limit: 10, used: 0, remaining: 10, unlimited: false, allowed: true },
    applyClicks: { limit: 3, used: 0, remaining: 3, unlimited: false, allowed: true },
  });
});

test("FREE: views 1, 9, 10, 11+", () => {
  for (const [used, remaining, allowed] of [[1, 9, true], [9, 1, true], [10, 0, false], [11, 0, false], [500, 0, false]]) {
    const v = getEntitlements("FREE", u(used, 0)).jobViews;
    assert.deepEqual([v.used, v.remaining, v.allowed], [used, remaining, allowed], `views=${used}`);
  }
});

test("FREE: apply clicks 2, 3, 4+", () => {
  for (const [used, remaining, allowed] of [[2, 1, true], [3, 0, false], [4, 0, false], [99, 0, false]]) {
    const a = getEntitlements("FREE", u(0, used)).applyClicks;
    assert.deepEqual([a.used, a.remaining, a.allowed], [used, remaining, allowed], `applies=${used}`);
  }
});

test("FREE: views and applies are independent", () => {
  const e = getEntitlements("FREE", u(10, 1));
  assert.equal(e.jobViews.allowed, false);
  assert.equal(e.applyClicks.allowed, true);
});

test("PRO: unlimited at zero and far above FREE limits", () => {
  for (const [v, a] of [[0, 0], [25, 10], [1_000_000, 1_000_000]]) {
    const e = getEntitlements("PRO", u(v, a));
    assert.deepEqual(e.jobViews, { limit: null, used: v, remaining: null, unlimited: true, allowed: true });
    assert.deepEqual(e.applyClicks, { limit: null, used: a, remaining: null, unlimited: true, allowed: true });
  }
});

test("invalid usage throws (never grants credits)", () => {
  for (const bad of [-1, -100, 1.5, NaN, Infinity, "3", null, undefined, {}, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => getEntitlements("FREE", u(bad, 0)), RangeError, `views=${String(bad)}`);
    assert.throws(() => getEntitlements("PRO", u(0, bad)), RangeError, `applies=${String(bad)}`);
  }
  assert.throws(() => getEntitlements("FREE", undefined), RangeError);
  assert.throws(() => getEntitlements("FREE", {}), RangeError);
});

test("unknown status fails closed", () => {
  for (const bad of ["pro", "free", "ADMIN", "", " PRO", null, undefined, 1, {}, ["PRO"], "__proto__", "constructor"]) {
    assert.throws(() => getEntitlements(bad, u(0, 0)), RangeError, String(bad));
    assert.equal(isSubscriptionStatus(bad), false);
  }
  assert.equal(isSubscriptionStatus("FREE"), true);
  assert.equal(isSubscriptionStatus("PRO"), true);
});

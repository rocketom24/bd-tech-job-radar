// Subscription entitlement rules. Pure: no database, no counters, no sessions, no status changes.
// The caller passes a TRUSTED status (from the authenticated database user, never from a request)
// and the usage counts it already read. Phase 4 connects this to tracking and enforcement.

export const SUBSCRIPTION_STATUSES = ["FREE", "PRO"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Per-account lifetime limits (no daily/monthly reset is defined). `null` = unlimited. */
export const PLAN_LIMITS = {
  FREE: { jobViews: 10, applyClicks: 3 }, // jobViews counts UNIQUE jobs viewed
  PRO: { jobViews: null, applyClicks: null },
} as const satisfies Record<SubscriptionStatus, { jobViews: number | null; applyClicks: number | null }>;

export interface UsageEntitlement {
  limit: number | null;
  used: number;
  remaining: number | null; // never negative; 0 when at or over the limit
  unlimited: boolean;
  allowed: boolean; // may ONE more use happen right now?
}

export interface Entitlements {
  subscriptionStatus: SubscriptionStatus;
  jobViews: UsageEntitlement;
  applyClicks: UsageEntitlement;
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

// Invalid input throws instead of being clamped: a negative count would otherwise hand out extra
// credits, and an unknown status must never fall through to a plan with more access (fail closed).
function assertCount(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

function evaluate(limit: number | null, used: number): UsageEntitlement {
  if (limit === null) return { limit, used, remaining: null, unlimited: true, allowed: true };
  return { limit, used, remaining: Math.max(0, limit - used), unlimited: false, allowed: used < limit };
}

export function getEntitlements(
  subscriptionStatus: unknown,
  usage: { jobViews: unknown; applyClicks: unknown },
): Entitlements {
  if (!isSubscriptionStatus(subscriptionStatus)) {
    throw new RangeError(`Unknown subscription status: ${String(subscriptionStatus)}`);
  }
  assertCount("jobViews", usage?.jobViews);
  assertCount("applyClicks", usage?.applyClicks);
  const limits = PLAN_LIMITS[subscriptionStatus];
  return {
    subscriptionStatus,
    jobViews: evaluate(limits.jobViews, usage.jobViews),
    applyClicks: evaluate(limits.applyClicks, usage.applyClicks),
  };
}

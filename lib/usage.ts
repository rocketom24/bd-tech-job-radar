import { forbidden, getCurrentUser, isForeignOrigin } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { getEntitlements } from "@/lib/entitlements";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { rateLimit, type LimitName } from "@/lib/rate-limit";
import type { Prisma } from "@/generated/prisma/client";

const MAX_INT4 = 2_147_483_647;

export { apiError };

export const internalError = (route: string, error: unknown) => {
  logError(route, error);
  return apiError("INTERNAL_ERROR", "Internal server error", 500);
};

/** Positive int4 or null. Same rule as GET /api/jobs/[id]. */
export function parseJobId(raw: string): number | null {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(id) && id <= MAX_INT4 ? id : null;
}

/** Shared guard for the POST usage routes: CSRF check, session user, then the per-user rate limit. */
export async function authenticate(request: Request, limit: Extract<LimitName, "view" | "apply">) {
  if (isForeignOrigin(request)) return { response: forbidden() };
  const user = await getCurrentUser();
  if (!user) return { response: apiError("UNAUTHENTICATED", "Not authenticated", 401) };
  const limited = await rateLimit(limit, user.id);
  if (limited) return { response: limited };
  return { user };
}

export async function countUsage(db: Prisma.TransactionClient | typeof prisma, userId: number) {
  const jobViews = await db.jobView.count({ where: { userId } });
  const applyClicks = await db.applyClick.count({ where: { userId } });
  return { jobViews, applyClicks };
}

/**
 * Runs `fn` inside a transaction that holds a row lock on the user (SELECT ... FOR UPDATE).
 * Every usage-changing request for the same user queues on that lock, so "count, check quota,
 * insert" cannot interleave between two requests. The lock is released at commit/rollback.
 * The plan is read AFTER the lock is held, so it is current. READ COMMITTED (the default) is
 * enough: each statement after the lock sees everything the previous lock holder committed.
 * Returns null if the user no longer exists.
 */
export async function withUserLock<T>(
  userId: number,
  fn: (tx: Prisma.TransactionClient, subscriptionStatus: string) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ subscriptionStatus: string }[]>`
        SELECT "subscriptionStatus" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (rows.length === 0) return null;
      return fn(tx, rows[0].subscriptionStatus);
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/**
 * The one place a job-detail view is authorised and recorded (used by GET /api/jobs/[id] and POST .../view).
 * Under the user lock: already viewed -> "already" (free, never counts again); else quota check, then insert.
 * Returns null if the user no longer exists. Throws RangeError on an unknown plan (fail closed).
 */
export async function recordJobView(userId: number, jobId: number) {
  return withUserLock(userId, async (tx, status) => {
    if (await tx.jobView.findUnique({ where: { userId_jobId: { userId, jobId } }, select: { id: true } })) {
      getEntitlements(status, { jobViews: 0, applyClicks: 0 }); // fail closed on an unknown plan
      return "already" as const;
    }
    if (!getEntitlements(status, await countUsage(tx, userId)).jobViews.allowed) return "limit" as const;
    await tx.jobView.create({ data: { userId, jobId } });
    return "created" as const;
  });
}

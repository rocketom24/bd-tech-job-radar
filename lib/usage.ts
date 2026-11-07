import { forbidden, getCurrentUser, isForeignOrigin } from "@/lib/auth";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const MAX_INT4 = 2_147_483_647;

export const apiError = (code: string, message: string, status: number) =>
  Response.json({ error: { code, message } }, { status });

export const internalError = (route: string, error: unknown) => {
  logError(route, error);
  return apiError("INTERNAL_ERROR", "Internal server error", 500);
};

/** Positive int4 or null. Same rule as GET /api/jobs/[id]. */
export function parseJobId(raw: string): number | null {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(id) && id <= MAX_INT4 ? id : null;
}

/** Shared guard for the POST usage routes: CSRF check, then the session user. */
export async function authenticate(request: Request) {
  if (isForeignOrigin(request)) return { response: forbidden() };
  const user = await getCurrentUser();
  if (!user) return { response: apiError("UNAUTHENTICATED", "Not authenticated", 401) };
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

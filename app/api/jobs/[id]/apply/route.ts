import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { apiError, authenticate, countUsage, internalError, parseJobId, withUserLock } from "@/lib/usage";

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    const jobId = parseJobId((await params).id);
    if (jobId === null) return apiError("INVALID_JOB_ID", "Invalid job id: must be a positive integer", 400);
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { sourceUrl: true } });
    if (!job) return apiError("JOB_NOT_FOUND", "Job not found", 404);
    if (!isHttpUrl(job.sourceUrl)) {
      return apiError("APPLY_URL_UNAVAILABLE", "This job has no valid application URL.", 422);
    }

    const result = await withUserLock(auth.user.id, async (tx, status) => {
      const usage = await countUsage(tx, auth.user.id);
      if (!getEntitlements(status, usage).applyClicks.allowed) return { limit: true } as const;
      await tx.applyClick.create({ data: { userId: auth.user.id, jobId } });
      const after = getEntitlements(status, { ...usage, applyClicks: usage.applyClicks + 1 });
      return { limit: false, remaining: after.applyClicks.remaining } as const;
    });

    if (result === null) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (result.limit) return apiError("APPLY_LIMIT_REACHED", "You have reached your free Apply-click limit.", 429);
    return Response.json({ success: true, applyUrl: job.sourceUrl, remaining: result.remaining });
  } catch (error) {
    if (error instanceof RangeError) return apiError("INVALID_SUBSCRIPTION", "Subscription status is invalid", 403);
    return internalError("POST /api/jobs/[id]/apply", error);
  }
}

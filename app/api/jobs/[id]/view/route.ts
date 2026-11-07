import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { apiError, authenticate, countUsage, internalError, parseJobId, withUserLock } from "@/lib/usage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    const jobId = parseJobId((await params).id);
    if (jobId === null) return apiError("INVALID_JOB_ID", "Invalid job id: must be a positive integer", 400);
    if (!(await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } }))) {
      return apiError("JOB_NOT_FOUND", "Job not found", 404);
    }

    const result = await withUserLock(auth.user.id, async (tx, status) => {
      if (await tx.jobView.findUnique({ where: { userId_jobId: { userId: auth.user.id, jobId } }, select: { id: true } })) {
        getEntitlements(status, { jobViews: 0, applyClicks: 0 }); // fail closed on an unknown plan
        return "already" as const;
      }
      const { jobViews: allowed } = getEntitlements(status, await countUsage(tx, auth.user.id));
      if (!allowed.allowed) return "limit" as const;
      await tx.jobView.create({ data: { userId: auth.user.id, jobId } });
      return "created" as const;
    });

    if (result === null) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (result === "limit") return apiError("VIEW_LIMIT_REACHED", "You have reached your free job-view limit.", 429);
    return Response.json({ success: true, viewed: true, alreadyViewed: result === "already" });
  } catch (error) {
    if (error instanceof RangeError) return apiError("INVALID_SUBSCRIPTION", "Subscription status is invalid", 403);
    return internalError("POST /api/jobs/[id]/view", error);
  }
}

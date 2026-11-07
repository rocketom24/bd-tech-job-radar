import { prisma } from "@/lib/prisma";
import { apiError, authenticate, internalError, parseJobId, recordJobView } from "@/lib/usage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request, "view");
    if (auth.response) return auth.response;
    const jobId = parseJobId((await params).id);
    if (jobId === null) return apiError("INVALID_JOB_ID", "Invalid job id: must be a positive integer", 400);
    if (!(await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } }))) {
      return apiError("JOB_NOT_FOUND", "Job not found", 404);
    }

    const result = await recordJobView(auth.user.id, jobId);

    if (result === null) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (result === "limit") return apiError("VIEW_LIMIT_REACHED", "You have reached your free job-view limit.", 429);
    return Response.json({ success: true, viewed: true, alreadyViewed: result === "already" });
  } catch (error) {
    if (error instanceof RangeError) return apiError("INVALID_SUBSCRIPTION", "Subscription status is invalid", 403);
    return internalError("POST /api/jobs/[id]/view", error);
  }
}

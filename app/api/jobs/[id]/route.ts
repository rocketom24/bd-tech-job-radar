import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { apiError, authenticate, internalError, parseJobId, recordJobView } from "@/lib/usage";

// Full job detail (description, sourceUrl, source) is gated: login required, and a FREE account may
// open 10 unique jobs. Re-opening a job already viewed is free. The check + JobView insert run in the
// same per-user lock as POST .../view, so concurrent requests cannot exceed the quota.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request, "view");
    if (auth.response) return auth.response;
    const id = parseJobId((await params).id);
    if (id === null) return apiError("INVALID_JOB_ID", "Invalid job id: must be a positive integer", 400);

    const data = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        organization: true,
        sector: true,
        category: true,
        location: true,
        description: true,
        salary: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryPeriod: true,
        salaryDisclosure: true,
        experience: true,
        skills: true,
        deadline: true,
        sourceId: true,
        sourceUrl: true,
        verified: true,
        createdAt: true,
        source: { select: { id: true, name: true, type: true, url: true } },
      },
    });
    if (!data) return apiError("JOB_NOT_FOUND", "Job not found", 404);

    const result = await recordJobView(auth.user.id, id);
    if (result === null) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (result === "limit") return apiError("VIEW_LIMIT_REACHED", "You have reached your free job-view limit.", 429);
    return Response.json({ data });
  } catch (error) {
    unstable_rethrow(error); // let Next's build-time "this route is dynamic" signal through
    if (error instanceof RangeError) return apiError("INVALID_SUBSCRIPTION", "Subscription status is invalid", 403);
    return internalError("GET /api/jobs/[id]", error);
  }
}

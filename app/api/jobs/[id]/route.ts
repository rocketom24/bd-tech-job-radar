import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

const MAX_INT4 = 2_147_483_647;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id > MAX_INT4) {
    return Response.json({ error: { message: "Invalid job id: must be a positive integer" } }, { status: 400 });
  }

  try {
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

    if (!data) {
      return Response.json({ error: { message: "Job not found" } }, { status: 404 });
    }
    return Response.json({ data });
  } catch (error) {
    logError("GET /api/jobs/[id]", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

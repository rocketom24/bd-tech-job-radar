import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const data = await prisma.job.findMany({
      select: {
        id: true,
        title: true,
        organization: true,
        sector: true,
        category: true,
        location: true,
        description: true,
        salary: true,
        experience: true,
        skills: true,
        deadline: true,
        sourceId: true,
        sourceUrl: true,
        verified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/jobs failed", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

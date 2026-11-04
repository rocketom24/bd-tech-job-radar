import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const data = await prisma.jobSource.findMany({
      select: { id: true, name: true, type: true, url: true },
      orderBy: { name: "asc" },
    });
    return Response.json({ data });
  } catch (error) {
    logError("GET /api/sources", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

import type { Prisma } from "@/generated/prisma/client";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { jobsQuerySchema } from "@/lib/schemas";
import { z } from "zod";

const FILTER_KEYS = ["keyword", "location", "category"] as const;

// Prisma passes contains/equals(mode: insensitive) to ILIKE unescaped, so
// user-supplied % _ \ would act as wildcards. Escape them to get literal search.
const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");

function badRequest(message: string, details?: unknown) {
  return Response.json({ error: { message, details } }, { status: 400 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const repeated = FILTER_KEYS.filter((key) => params.getAll(key).length > 1);
  if (repeated.length > 0) {
    return badRequest(`Repeated query parameter(s) not allowed: ${repeated.join(", ")}`);
  }

  const parsed = jobsQuerySchema.safeParse(
    Object.fromEntries(FILTER_KEYS.flatMap((key) => (params.has(key) ? [[key, params.get(key)]] : []))),
  );
  if (!parsed.success) {
    return badRequest("Invalid query parameters", z.flattenError(parsed.error).fieldErrors);
  }
  const { keyword, location, category } = parsed.data;

  const where: Prisma.JobWhereInput = {
    AND: [
      ...(keyword
        ? [
            {
              OR: [
                { title: { contains: literal(keyword), mode: "insensitive" as const } },
                { organization: { contains: literal(keyword), mode: "insensitive" as const } },
                { description: { contains: literal(keyword), mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...(location ? [{ location: { contains: literal(location), mode: "insensitive" as const } }] : []),
      ...(category ? [{ category: { equals: literal(category), mode: "insensitive" as const } }] : []),
    ],
  };

  try {
    const data = await prisma.job.findMany({
      where,
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
    logError("GET /api/jobs", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

import type { Prisma } from "@/generated/prisma/client";
import { apiError } from "@/lib/api-error";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { jobsQuerySchema } from "@/lib/schemas";
import { z } from "zod";

const FILTER_KEYS = ["keyword", "location", "category"] as const;

// Prisma passes contains/equals(mode: insensitive) to ILIKE unescaped, so
// user-supplied % _ \ would act as wildcards. Escape them to get literal search.
const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const badRequest = (message: string, details?: unknown) => apiError("INVALID_QUERY", message, 400, details);

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
    // Summary only: description and sourceUrl are detail fields (GET /api/jobs/[id], quota-gated / Apply).
    const data = await prisma.job.findMany({
      where,
      select: {
        id: true,
        title: true,
        organization: true,
        sector: true,
        category: true,
        location: true,
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
        verified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data });
  } catch (error) {
    logError("GET /api/jobs", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
}

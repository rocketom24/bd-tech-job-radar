import { apiError } from "@/lib/api-error";
import { createSession, forbidden, hashPassword, isForeignOrigin, parseBody, safeUserSelect } from "@/lib/auth";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { ipSubject, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/schemas";

const conflict = () => apiError("EMAIL_TAKEN", "An account with this email already exists", 409);

export async function POST(request: Request) {
  if (isForeignOrigin(request)) return forbidden();

  try {
    const limited = await rateLimit("register", ipSubject(request));
    if (limited) return limited;
    const body = await parseBody(request, registerSchema);
    if (body.response) return body.response;
    const { email, password } = body.data;

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return conflict();
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash }, select: safeUserSelect });
    await createSession(user.id);
    return Response.json({ data: user }, { status: 201 });
  } catch (error) {
    if ((error as { code?: unknown })?.code === "P2002") return conflict(); // lost a race on the unique email
    logError("POST /api/auth/register", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
}

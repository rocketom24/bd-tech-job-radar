import {
  createSession,
  forbidden,
  isForeignOrigin,
  parseBody,
  safeUserSelect,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  if (isForeignOrigin(request)) return forbidden();
  const body = await parseBody(request, loginSchema);
  if (body.response) return body.response;
  const { email, password } = body.data;

  try {
    const found = await prisma.user.findUnique({
      where: { email },
      select: { ...safeUserSelect, passwordHash: true },
    });
    // Unknown email, legacy user without a password, and wrong password all look identical.
    const ok = found?.passwordHash
      ? await verifyPassword(password, found.passwordHash)
      : (await verifyAgainstDummy(password), false);
    if (!found || !ok) {
      return Response.json({ error: { message: "Invalid email or password." } }, { status: 401 });
    }
    await createSession(found.id);
    const { id, email: userEmail, subscriptionStatus, createdAt } = found;
    return Response.json({ data: { id, email: userEmail, subscriptionStatus, createdAt } });
  } catch (error) {
    logError("POST /api/auth/login", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

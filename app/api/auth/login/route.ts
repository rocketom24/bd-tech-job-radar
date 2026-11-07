import { apiError } from "@/lib/api-error";
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
import { emailSubject, ipSubject, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  if (isForeignOrigin(request)) return forbidden();

  try {
    const ipLimited = await rateLimit("loginIp", ipSubject(request));
    if (ipLimited) return ipLimited;
    const body = await parseBody(request, loginSchema);
    if (body.response) return body.response;
    const { email, password } = body.data;
    const emailLimited = await rateLimit("loginEmail", emailSubject(email));
    if (emailLimited) return emailLimited;

    const found = await prisma.user.findUnique({
      where: { email },
      select: { ...safeUserSelect, passwordHash: true },
    });
    // Unknown email, legacy user without a password, and wrong password all look identical.
    const ok = found?.passwordHash
      ? await verifyPassword(password, found.passwordHash)
      : (await verifyAgainstDummy(password), false);
    if (!found || !ok) {
      return apiError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
    }
    await createSession(found.id);
    const { id, email: userEmail, subscriptionStatus, createdAt } = found;
    return Response.json({ data: { id, email: userEmail, subscriptionStatus, createdAt } });
  } catch (error) {
    logError("POST /api/auth/login", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
}

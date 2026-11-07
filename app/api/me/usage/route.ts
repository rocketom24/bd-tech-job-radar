import { unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { apiError, countUsage, internalError } from "@/lib/usage";

const pick = ({ used, limit, remaining, unlimited }: { used: number; limit: number | null; remaining: number | null; unlimited: boolean }) => ({
  used,
  limit,
  remaining,
  unlimited,
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    const e = getEntitlements(user.subscriptionStatus, await countUsage(prisma, user.id));
    return Response.json({
      success: true,
      data: { subscriptionStatus: e.subscriptionStatus, jobViews: pick(e.jobViews), applyClicks: pick(e.applyClicks) },
    });
  } catch (error) {
    unstable_rethrow(error); // let Next's build-time "this route is dynamic" signal through
    if (error instanceof RangeError) return apiError("INVALID_SUBSCRIPTION", "Subscription status is invalid", 403);
    return internalError("GET /api/me/usage", error);
  }
}

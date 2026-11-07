import { unstable_rethrow } from "next/navigation";
import { apiError } from "@/lib/api-error";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/log";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    return Response.json({ data: user });
  } catch (error) {
    unstable_rethrow(error); // let Next's build-time "this route is dynamic" signal through
    logError("GET /api/auth/me", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
}

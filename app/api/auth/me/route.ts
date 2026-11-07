import { unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/log";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { message: "Not authenticated" } }, { status: 401 });
    return Response.json({ data: user });
  } catch (error) {
    unstable_rethrow(error); // let Next's build-time "this route is dynamic" signal through
    logError("GET /api/auth/me", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

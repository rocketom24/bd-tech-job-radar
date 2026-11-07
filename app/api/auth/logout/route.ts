import { destroySession, forbidden, isForeignOrigin } from "@/lib/auth";
import { logError } from "@/lib/log";

export async function POST(request: Request) {
  if (isForeignOrigin(request)) return forbidden();
  try {
    await destroySession();
    return Response.json({ data: { loggedOut: true } });
  } catch (error) {
    logError("POST /api/auth/logout", error);
    return Response.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}

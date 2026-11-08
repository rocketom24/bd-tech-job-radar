import { openApiSpec } from "@/lib/openapi";

export function GET() {
  return Response.json(openApiSpec);
}

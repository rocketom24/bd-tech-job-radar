import { ApiReference } from "@scalar/nextjs-api-reference";

// Scalar API reference for the OpenAPI spec served at /openapi.json.
export const GET = ApiReference({
  url: "/openapi.json",
  pageTitle: "BD Tech Radar API",
  theme: "default",
  hideClientButton: true,
});

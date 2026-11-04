// Log only the error class and Prisma/driver code. Raw error objects and messages
// can embed connection details or query values, so they are never logged.
export function logError(route: string, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`${route} failed: ${name}${typeof code === "string" ? ` (${code})` : ""}`);
}

/** The one error shape every API route returns: { error: { code, message, details? } }. */
export const apiError = (code: string, message: string, status: number, details?: unknown, headers?: HeadersInit) =>
  Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status, headers });

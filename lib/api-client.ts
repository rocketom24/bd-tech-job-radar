import type {
  ApiErrorBody,
  ApplyResponse,
  DataEnvelope,
  JobDetail,
  JobFilters,
  JobSummary,
  SafeUser,
  Usage,
  UsageResponse,
} from "./api-types";

/** Every failure of the API client, including network and parse errors (status 0 = no HTTP response). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

const FALLBACK_CODES: Record<number, string> = {
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
};

function isErrorBody(value: unknown): value is ApiErrorBody {
  const error = (value as ApiErrorBody | null)?.error;
  return typeof error === "object" && error !== null && typeof error.code === "string" && typeof error.message === "string";
}

async function request<T>(path: string, init: { method?: "GET" | "POST"; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
      headers: init.json === undefined ? undefined : { "content-type": "application/json" },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  let body: unknown = null;
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    if (isErrorBody(body)) throw new ApiError(response.status, body.error.code, body.error.message, body.error.details, retryAfter);
    const code = response.status >= 500 ? "INTERNAL_ERROR" : (FALLBACK_CODES[response.status] ?? "HTTP_ERROR");
    throw new ApiError(response.status, code, "Something went wrong. Try again.", undefined, retryAfter);
  }
  if (body === null) throw new ApiError(response.status, "INVALID_RESPONSE", "The server sent an unreadable response.");
  return body as T;
}

export const api = {
  async register(email: string, password: string) {
    return (await request<DataEnvelope<SafeUser>>("/api/auth/register", { method: "POST", json: { email, password } })).data;
  },
  async login(email: string, password: string) {
    return (await request<DataEnvelope<SafeUser>>("/api/auth/login", { method: "POST", json: { email, password } })).data;
  },
  async logout() {
    await request<DataEnvelope<{ loggedOut: boolean }>>("/api/auth/logout", { method: "POST" });
  },
  async me(signal?: AbortSignal) {
    return (await request<DataEnvelope<SafeUser>>("/api/auth/me", { signal })).data;
  },
  async jobs(filters: JobFilters, signal?: AbortSignal) {
    const params = new URLSearchParams();
    for (const key of ["keyword", "location", "category"] as const) {
      const value = filters[key]?.trim();
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return (await request<DataEnvelope<JobSummary[]>>(`/api/jobs${query ? `?${query}` : ""}`, { signal })).data;
  },
  /** Opening a job's detail records a unique view server-side. Call only after an intentional open. */
  async jobDetail(id: string, signal?: AbortSignal) {
    return (await request<DataEnvelope<JobDetail>>(`/api/jobs/${encodeURIComponent(id)}`, { signal })).data;
  },
  apply(id: number) {
    return request<ApplyResponse>(`/api/jobs/${id}/apply`, { method: "POST" });
  },
  async usage(signal?: AbortSignal): Promise<Usage> {
    return (await request<UsageResponse>("/api/me/usage", { signal })).data;
  },
};

/** Human message for an error, branching on the stable `code` rather than the server's text. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "VIEW_LIMIT_REACHED":
      return "You have used all 10 free job views.";
    case "APPLY_LIMIT_REACHED":
      return "You have used all 3 free Apply clicks.";
    case "APPLY_URL_UNAVAILABLE":
      return "This job has no working application link. Check the original source instead.";
    case "RATE_LIMITED":
      return error.retryAfter ? `Too many attempts. Try again in ${error.retryAfter} seconds.` : "Too many attempts. Wait a moment and try again.";
    case "UNAUTHENTICATED":
      return "Your session has ended. Log in again.";
    case "INVALID_CREDENTIALS":
      return "Email or password is incorrect.";
    case "EMAIL_TAKEN":
      return "An account with this email already exists.";
    case "JOB_NOT_FOUND":
    case "INVALID_JOB_ID":
      return "This job does not exist or has been removed.";
    case "INTERNAL_ERROR":
      return "The server had a problem. Try again in a moment.";
    default:
      return error.message || "Something went wrong. Try again.";
  }
}

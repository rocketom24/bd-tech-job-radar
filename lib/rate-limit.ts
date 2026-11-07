import { createHmac } from "node:crypto";
import { apiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

// Fixed-window limits, counted in Postgres so every app instance shares them.
// Windows are aligned to the epoch using the DATABASE clock (no app-server clock skew).
export const LIMITS = {
  register: { max: 5, windowSec: 3600 }, // per client IP
  loginIp: { max: 20, windowSec: 900 }, // per client IP
  loginEmail: { max: 10, windowSec: 900 }, // per target email, across all IPs
  view: { max: 60, windowSec: 60 }, // per authenticated user
  apply: { max: 20, windowSec: 60 }, // per authenticated user
} as const;
export type LimitName = keyof typeof LIMITS;

/**
 * Client IP from the ONE header the deployment trusts (TRUSTED_IP_HEADER, e.g. "x-real-ip" on
 * Vercel, which overwrites it). Unset = trust nothing: every client shares the "unknown" bucket,
 * which fails safe (stricter) rather than letting a spoofed header pick its own bucket.
 */
function clientIp(request: Request) {
  const header = process.env.TRUSTED_IP_HEADER;
  const value = header ? request.headers.get(header)?.split(",")[0].trim() : undefined;
  return value ? value.slice(0, 64) : "unknown";
}

/** HMAC pseudonym: raw IPs and emails never reach the database. */
export function pseudonym(scope: string, value: string) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("RATE_LIMIT_SECRET must be set (32+ characters)");
  return createHmac("sha256", secret).update(`${scope}\0${value}`).digest("hex").slice(0, 32);
}

export const ipSubject = (request: Request) => pseudonym("ip", clientIp(request));
export const emailSubject = (email: string) => pseudonym("email", email);

/** Counts one hit; returns a ready 429 Response when over the limit, else null. One statement. */
export async function rateLimit(name: LimitName, subject: string | number): Promise<Response | null> {
  const { max, windowSec } = LIMITS[name];
  const [row] = await prisma.$queryRaw<{ count: number; retryAfter: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${`${name}:${subject}`}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}::float8) * ${windowSec}::float8), 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"::int AS "count",
      GREATEST(1, ceil(extract(epoch from ("windowStart" + make_interval(secs => ${windowSec}::float8)) - now())))::int AS "retryAfter"`;
  // ponytail: ~1% of calls purge windows older than a day; a cron job is the upgrade if the table ever grows.
  if (Math.random() < 0.01) {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`.catch(() => {});
  }
  if (row.count <= max) return null;
  return apiError("RATE_LIMITED", "Too many requests. Please try again later.", 429, undefined, {
    "Retry-After": String(row.retryAfter),
  });
}

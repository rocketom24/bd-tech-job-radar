import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "bdr_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // fixed lifetime, no sliding expiration

// ---- Password hashing (scrypt) -----------------------------------------------------
// Stored format: scrypt$v1$N$r$p$<salt b64>$<hash b64>. Parameters are stored per hash,
// so they can be raised later without invalidating existing passwords.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2; // scrypt needs ~128*N*r bytes; Node's default cap is too low

const scryptAsync = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", "v1", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, version, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || version !== "v1" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM };
  try {
    const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, params);
    return timingSafeEqual(actual, expected);
  } catch {
    return false; // malformed or out-of-range parameters
  }
}

// Verified against when the email is unknown, so login timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export function verifyAgainstDummy(password: string) {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash.then((h) => verifyPassword(password, h));
}

// ---- Sessions ----------------------------------------------------------------------
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const safeUserSelect = { id: true, email: true, subscriptionStatus: true, createdAt: true } as const;

/** Creates a DB session (only the SHA-256 of the token is stored) and sets the cookie. */
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the safe profile of the logged-in user, or null (missing, unknown or expired session). */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { expiresAt: true, user: { select: safeUserSelect } },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { tokenHash } });
    return null;
  }
  return session.user;
}

/** Deletes the current session (if any) and clears the cookie. Safe to call repeatedly. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

// ---- Request helpers ---------------------------------------------------------------
/**
 * CSRF defence in depth on top of SameSite=Lax: a browser request carrying an Origin header
 * from another host is rejected. Requests without Origin (curl, tests, server-to-server) pass.
 */
export function isForeignOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

export const forbidden = () =>
  Response.json({ error: { message: "Cross-origin request rejected" } }, { status: 403 });

/** Parses a JSON body with a schema. Returns { data } or a ready 400 { response }. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { response: Response.json({ error: { message: "Request body must be valid JSON" } }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      response: Response.json(
        { error: { message: "Invalid request body", details: z.flattenError(parsed.error).fieldErrors } },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data as z.infer<T> };
}

// Auth HTTP tests. Run a dev server first (npm run dev), then: npm run test:api
// Creates users named authtest-*@example.test; only those are deleted afterwards (sessions cascade).
// Expiring a session needs the database, so that one test runs a single parameterised UPDATE
// (via @neondatabase/serverless over HTTP) scoped to that session's tokenHash.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

// Each call pretends to come from its own client IP so the per-IP rate limits (tests/security.test.mjs) never trip here.
// Needs TRUSTED_IP_HEADER=x-forwarded-for in the dev server env (see .env.example).
const fakeIp = () => `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = `pw-${randomUUID()}`; // random per run: no fixed credential in the public repo
const RUN = randomUUID().slice(0, 8);
let n = 0;
const newEmail = () => `authtest-${RUN}-${++n}@example.test`;

// Direct SQL over Neon's HTTP endpoint: one request, no child process, no retries. Always parameterised.
const sql = neon(process.env.DATABASE_URL).query;

const STARTED = new Date().toISOString();
after(async () => {
  await sql(`DELETE FROM "User" WHERE email LIKE 'authtest-%@example.test'`);
  // dev-database only: windows are at most 1 h long, so this removes just the rows these requests created (fake IPs)
  await sql(`DELETE FROM "RateLimit" WHERE "windowStart" >= $1::timestamptz - interval '1 hour' AND key LIKE ANY (ARRAY['register:%', 'loginIp:%', 'loginEmail:%'])`, [STARTED]);
});

async function call(path, { method = "POST", body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), "x-forwarded-for": fakeIp(), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const json = await res.json();
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("bdr_session="));
  return { status: res.status, body: json, setCookie, cookie: setCookie?.split(";")[0] };
}
const register = (email = newEmail(), password = PASSWORD) => call("/api/auth/register", { body: { email, password } });
const me = (cookie) => call("/api/auth/me", { method: "GET", cookie });
const USER_KEYS = ["createdAt", "email", "id", "subscriptionStatus"];
const noSecrets = (r) => assert.ok(!/passwordHash|scrypt|tokenHash/i.test(JSON.stringify(r.body)));

test("register: success, 201, safe user, session cookie attributes", async () => {
  const email = newEmail();
  const r = await register(email);
  assert.equal(r.status, 201);
  assert.deepEqual(Object.keys(r.body), ["data"]);
  assert.deepEqual(Object.keys(r.body.data).sort(), USER_KEYS);
  assert.equal(r.body.data.email, email);
  assert.equal(r.body.data.subscriptionStatus, "FREE");
  noSecrets(r);
  assert.ok(r.setCookie, "bdr_session cookie set");
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);
  assert.match(r.setCookie, /Path=\//i);
  const expires = Date.parse(/Expires=([^;]+)/i.exec(r.setCookie)[1]);
  const days = (expires - Date.now()) / 86_400_000;
  assert.ok(days > 6.99 && days < 7.01, `7-day expiry, got ${days}`);
  assert.ok(!JSON.stringify(r.body).includes(r.cookie.split("=")[1]), "token never in JSON");
});

test("register: email trimmed and lowercased", async () => {
  const email = newEmail();
  const r = await register(`  ${email.toUpperCase()}  `);
  assert.equal(r.status, 201);
  assert.equal(r.body.data.email, email);
});

test("register: duplicate email -> 409, also case-insensitively", async () => {
  const email = newEmail();
  assert.equal((await register(email)).status, 201);
  for (const e of [email, email.toUpperCase()]) {
    const r = await register(e);
    assert.equal(r.status, 409);
    assert.equal(r.setCookie, undefined);
    noSecrets(r);
  }
});

const badRegistrations = [
  ["missing email", { password: PASSWORD }, "email"],
  ["invalid email", { email: "not-an-email", password: PASSWORD }, "email"],
  ["missing password", { email: "x@example.test" }, "password"],
  ["short password (11)", { email: "x@example.test", password: "a".repeat(11) }, "password"],
  ["password too long", { email: "x@example.test", password: "a".repeat(129) }, "password"],
  ["non-string password", { email: "x@example.test", password: 123456789012 }, "password"],
  ["non-string email", { email: ["a@b.co"], password: PASSWORD }, "email"],
];
for (const [name, body, field] of badRegistrations) {
  test(`register: ${name} -> 400`, async () => {
    const r = await call("/api/auth/register", { body });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details[field], `details.${field}`);
    assert.equal(r.setCookie, undefined);
  });
}
test("register: malformed JSON / non-object body -> 400", async () => {
  assert.equal((await call("/api/auth/register", { body: "{nope" })).status, 400);
  assert.equal((await call("/api/auth/register", { body: "null" })).status, 400);
});
test("register: password is not trimmed (12 chars incl. spaces is valid)", async () => {
  assert.equal((await register(newEmail(), " ".repeat(12))).status, 201);
});
test("register: foreign Origin rejected, same Origin allowed", async () => {
  const host = new URL(BASE).host;
  const bad = await call("/api/auth/register", { body: { email: newEmail(), password: PASSWORD }, headers: { origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  const ok = await call("/api/auth/register", { body: { email: newEmail(), password: PASSWORD }, headers: { origin: `http://${host}` } });
  assert.equal(ok.status, 201);
});

test("login: success sets cookie, normalizes email, returns safe user", async () => {
  const email = newEmail();
  await register(email);
  const r = await call("/api/auth/login", { body: { email: `  ${email.toUpperCase()} `, password: PASSWORD } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.data).sort(), USER_KEYS);
  assert.equal(r.body.data.email, email);
  noSecrets(r);
  assert.ok(r.setCookie);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.equal((await me(r.cookie)).body.data.email, email);
});

test("login: wrong password and unknown email give the same generic 401", async () => {
  const email = newEmail();
  await register(email);
  const wrong = await call("/api/auth/login", { body: { email, password: PASSWORD + "x" } });
  const unknown = await call("/api/auth/login", { body: { email: newEmail(), password: PASSWORD } });
  for (const r of [wrong, unknown]) {
    assert.equal(r.status, 401);
    assert.equal(r.setCookie, undefined);
  }
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(wrong.body.error.message, "Invalid email or password.");
});

test("login: missing credentials -> 400", async () => {
  assert.equal((await call("/api/auth/login", { body: {} })).status, 400);
  assert.equal((await call("/api/auth/login", { body: { email: newEmail() } })).status, 400);
  assert.equal((await call("/api/auth/login", { body: { password: PASSWORD } })).status, 400);
});

test("me: authenticated returns the right safe user", async () => {
  const email = newEmail();
  const reg = await register(email);
  const r = await me(reg.cookie);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { data: reg.body.data });
  noSecrets(r);
});

test("me: no cookie / garbage cookie -> 401", async () => {
  for (const cookie of [undefined, "bdr_session=garbage", "bdr_session="]) {
    const r = await me(cookie);
    assert.equal(r.status, 401);
    assert.deepEqual(Object.keys(r.body), ["error"]);
  }
});

test("me: expired session is rejected (and removed)", async () => {
  const reg = await register();
  assert.equal((await me(reg.cookie)).status, 200, "session works before expiry");
  const hash = createHash("sha256").update(reg.cookie.split("=")[1]).digest("hex");
  const expired = await sql(
    `UPDATE "Session" SET "expiresAt" = now() - interval '1 minute' WHERE "tokenHash" = $1 RETURNING id`,
    [hash],
  );
  assert.equal(expired.length, 1, "exactly this one session was expired");
  assert.equal((await me(reg.cookie)).status, 401);
  assert.equal((await sql(`SELECT 1 FROM "Session" WHERE "tokenHash" = $1`, [hash])).length, 0, "expired row deleted");
  assert.equal((await me(reg.cookie)).status, 401);
});

test("logout: invalidates session, clears cookie, is idempotent", async () => {
  const reg = await register();
  const out = await call("/api/auth/logout", { cookie: reg.cookie });
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /bdr_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  assert.equal((await me(reg.cookie)).status, 401, "old token no longer works");
  assert.equal((await call("/api/auth/logout", { cookie: reg.cookie })).status, 200, "repeat with stale cookie");
  assert.equal((await call("/api/auth/logout")).status, 200, "no cookie at all");
});

test("logout only ends the current session", async () => {
  const email = newEmail();
  const a = await register(email);
  const b = await call("/api/auth/login", { body: { email, password: PASSWORD } });
  await call("/api/auth/logout", { cookie: a.cookie });
  assert.equal((await me(a.cookie)).status, 401);
  assert.equal((await me(b.cookie)).status, 200);
});

test("job and source endpoints stay public", async () => {
  for (const p of ["/api/jobs", "/api/sources"]) assert.equal((await fetch(BASE + p)).status, 200);
});

test("subscription: registration is always FREE, client-supplied status is ignored", async () => {
  for (const extra of [{ subscriptionStatus: "PRO" }, { subscription: "PRO", plan: "PRO", role: "admin" }]) {
    const email = newEmail();
    const r = await call("/api/auth/register", { body: { email, password: PASSWORD, ...extra } });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.subscriptionStatus, "FREE");
    assert.equal((await me(r.cookie)).body.data.subscriptionStatus, "FREE");
    const [row] = await sql(`SELECT "subscriptionStatus" FROM "User" WHERE email = $1`, [email]);
    assert.equal(row.subscriptionStatus, "FREE");
  }
});

test("subscription: login and /me report the database value and never change it", async () => {
  const email = newEmail();
  await register(email);
  await sql(`UPDATE "User" SET "subscriptionStatus" = 'PRO' WHERE email = $1`, [email]); // scoped to this test user
  // a client-supplied status on login must not matter either way
  const login = await call("/api/auth/login", { body: { email, password: PASSWORD, subscriptionStatus: "FREE" } });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.subscriptionStatus, "PRO");
  assert.equal((await me(login.cookie)).body.data.subscriptionStatus, "PRO");
  const [row] = await sql(`SELECT "subscriptionStatus" FROM "User" WHERE email = $1`, [email]);
  assert.equal(row.subscriptionStatus, "PRO");
});

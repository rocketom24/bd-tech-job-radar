// Starts a throwaway dev server whose DATABASE_URL points at a dead local port (process env only;
// .env is untouched) and checks every endpoint fails safely. Never touches a real database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { test, before, after } from "node:test";

const PORT = 3299;
const DEAD_URL = "postgresql://nobody:secret-pw-marker@127.0.0.1:1/nodb";
let proc;
let log = "";
// Next rewrites tsconfig.json for the custom distDir; snapshot it and restore afterwards.
const TSCONFIG = new URL("../tsconfig.json", import.meta.url);
const tsconfigBefore = readFileSync(TSCONFIG, "utf8");
const BUILD_DIR = new URL("../.next-dbfail", import.meta.url); // never the normal .next

before(async () => {
  proc = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    shell: true,
    env: { ...process.env, DATABASE_URL: DEAD_URL, NEXT_DIST_DIR: ".next-dbfail" },
  });
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 60 && !/Ready/.test(log); i++) await new Promise((r) => setTimeout(r, 500));
  assert.match(log, /Ready/, "dev server did not start");
});
after(async () => {
  if (proc) {
    const exited = new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r)));
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"]);
    else proc.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    await new Promise((r) => setTimeout(r, 500)); // let file handles release
  }
  rmSync(BUILD_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  if (readFileSync(TSCONFIG, "utf8") !== tsconfigBefore) writeFileSync(TSCONFIG, tsconfigBefore);
});

for (const path of ["/api/jobs", "/api/jobs/13", "/api/sources"]) {
  test(`DB down: ${path} -> generic 500, no leaks`, async () => {
    // a (fake) session cookie forces the session lookup, which hits the dead DB; without one the gated route 401s before any query
    const res = await fetch(`http://localhost:${PORT}${path}`, { headers: { cookie: "bdr_session=fake-token" } });
    const text = await res.text();
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
}

test("DB down: server log has no credentials or stack traces", async () => {
  await new Promise((r) => setTimeout(r, 500));
  assert.match(log, /failed: /);
  for (const bad of ["secret-pw-marker", "nobody", "127.0.0.1:1", "postgresql://", "    at "]) {
    assert.ok(!log.includes(bad), `log leaked: ${bad === "secret-pw-marker" ? "password marker" : bad}`);
  }
});

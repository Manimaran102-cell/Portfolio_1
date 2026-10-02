/*
 * End-to-end test for the contact API. Boots the built server on a spare port,
 * exercises every endpoint, then shuts it down.
 *
 *   npm run test:e2e
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_FILE = path.join(process.cwd(), "data", "messages.json");

const ENV = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: "test",
  ADMIN_EMAIL: "owner@example.com",
  ADMIN_PASSWORD: "test-password-123",
  JWT_SECRET: "test-secret-abc123",
  ALLOWED_ORIGINS: "https://manimaran102-cell.github.io",
};

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
  }
}

interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

async function req(
  path: string,
  init: RequestInit & { token?: string; origin?: string } = {}
): Promise<Res> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.origin) headers.origin = init.origin;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/** A submission a human could plausibly have filled in. */
function goodMessage(over: Record<string, unknown> = {}) {
  return {
    name: "Priya Raman",
    email: "priya@example.com",
    topic: "Full-time role",
    company: "Zoho",
    message: "We have an opening for a MERN fresher. Are you interested in applying?",
    source: "https://manimaran102-cell.github.io/#contact",
    formStartedAt: Date.now() - 8000,
    ...over,
  };
}

async function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error("server never became ready");
}

async function main() {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);

  const server = spawn("node", ["dist/server.js"], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  const serverOut: string[] = [];
  server.stdout.on("data", (d) => serverOut.push(d.toString()));
  server.stderr.on("data", (d) => serverOut.push(d.toString()));

  try {
    await waitForServer();
    console.log("\n== health & meta ==");
    const health = await req("/api/health");
    check("GET /api/health returns 200", health.status === 200, health.body);
    check("health reports the service name", health.body?.service === "portfolio-api");
    check("email reported as off when SMTP is unset", health.body?.emailEnabled === false);

    const meta = await req("/api/messages/meta");
    check("GET /api/messages/meta returns 200", meta.status === 200);
    check("meta lists the four topics", meta.body?.data?.topics?.length === 4, meta.body?.data?.topics);
    check("meta exposes the message length limit", meta.body?.data?.limits?.message?.max === 4000);

    console.log("\n== validation ==");
    const noName = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ name: "" })) });
    check("missing name -> 400", noName.status === 400, noName.body);
    check("missing name error is readable", String(noName.body?.error).includes("Name is required"), noName.body?.error);

    const badEmail = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ email: "not-an-email" })) });
    check("invalid email -> 400", badEmail.status === 400);

    const shortMessage = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ message: "hi" })) });
    check("too-short message -> 400", shortMessage.status === 400);

    const badTopic = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ topic: "Pizza order" })) });
    check("unknown topic -> 400", badTopic.status === 400, badTopic.body);

    const longName = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ name: "a".repeat(200) })) });
    check("over-long name -> 400", longName.status === 400);

    const emptyBody = await req("/api/messages", { method: "POST", body: JSON.stringify({}) });
    check("empty body -> 400", emptyBody.status === 400);

    console.log("\n== happy path ==");
    const ok = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage()) });
    check("valid submission -> 201", ok.status === 201, ok.body);
    check("201 returns a message id", typeof ok.body?.data?.id === "string", ok.body?.data);
    check("201 does not leak the visitor ip", !JSON.stringify(ok.body).includes("127.0.0.1"), ok.body);
    check("201 does not echo the message back", !JSON.stringify(ok.body).includes("MERN fresher"), ok.body);

    console.log("\n== anti-spam ==");
    const honey = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ website: "http://spam.example" })) });
    check("honeypot returns 201 so the bot learns nothing", honey.status === 201, honey.body);

    const tooFast = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ formStartedAt: Date.now() - 100 })) });
    check("instant submit returns 201", tooFast.status === 201, tooFast.body);

    const noTimestamp = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ formStartedAt: undefined })) });
    check("missing formStartedAt still accepted (older clients)", noTimestamp.status === 201);

    console.log("\n== storage ==");
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    // two genuine submissions so far: the happy path and the client that sent
    // no formStartedAt. Both bot traps must have been dropped.
    check("only genuine messages were stored", stored.length === 2, stored.length);
    check("stored message keeps the name", stored[0]?.name === "Priya Raman");
    check("stored message records status new", stored[0]?.status === "new");
    check("stored message notes email was skipped", stored[0]?.emailError === "smtp not configured", stored[0]?.emailError);
    check("bot submissions were not stored", !JSON.stringify(stored).includes("spam.example"));

    console.log("\n== injection safety ==");
    const xss = await req("/api/messages", {
      method: "POST",
      body: JSON.stringify(goodMessage({
        name: "<script>alert(1)</script>",
        message: "<img src=x onerror=alert(2)> and a normal line",
      })),
    });
    check("html in a submission is accepted (stored raw, escaped only on email)", xss.status === 201);
    const afterXss = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    const xssDoc = afterXss.find((d: any) => d.name.includes("script"));
    check("raw text is preserved in storage", typeof xssDoc?.name === "string" && xssDoc.name.includes("<script>"));

    console.log("\n== header injection ==");
    const crlf = await req("/api/messages", {
      method: "POST",
      body: JSON.stringify(goodMessage({ email: "attacker@example.com\r\nBcc: victim@example.com" })),
    });
    check("email with CRLF is rejected by validation", crlf.status === 400, crlf.body);

    console.log("\n== payload limits ==");
    const huge = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ message: "x".repeat(50000) })) });
    check("oversized body is refused", huge.status === 413 || huge.status === 400, huge.status);

    console.log("\n== concurrency ==");
    const burst = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ name: `Load Test ${i}`, email: `load${i}@example.com` })) })
      )
    );
    check("all 12 concurrent submissions accepted", burst.every((r) => r.status === 201), burst.map((r) => r.status));
    const afterBurst = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    check("no message lost in the concurrent writes (15 total)", afterBurst.length === 15, afterBurst.length);
    check("every stored message has a unique id", new Set(afterBurst.map((d: any) => d._id)).size === afterBurst.length);

    console.log("\n== admin auth ==");
    const noAuth = await req("/api/messages");
    check("GET /api/messages without a token -> 401", noAuth.status === 401, noAuth.body);

    const badToken = await req("/api/messages", { token: "not-a-real-token" });
    check("GET /api/messages with a bad token -> 401", badToken.status === 401);

    const badLogin = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "wrong" }) });
    check("login with a wrong password -> 401", badLogin.status === 401);
    check("login failure does not reveal which field was wrong", !JSON.stringify(badLogin.body).toLowerCase().includes("password"), badLogin.body);

    const noUser = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "nobody@example.com", password: "test-password-123" }) });
    check("login with a wrong email -> 401", noUser.status === 401);

    const login = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "test-password-123" }) });
    check("login with correct credentials -> 200", login.status === 200, login.body);
    const token = login.body?.data?.token;
    check("login returns a token", typeof token === "string" && token.length > 20);

    console.log("\n== admin inbox ==");
    const list = await req("/api/messages", { token });
    check("GET /api/messages with a token -> 200", list.status === 200, list.status);
    check("inbox returns every stored message", list.body?.total === 15, list.body?.total);
    check("inbox is newest first", list.body?.items?.[0]?.name === "Load Test 11", list.body?.items?.[0]?.name);

    const filtered = await req("/api/messages?status=new&limit=3", { token });
    check("status filter + limit applied", filtered.body?.items?.length === 3, filtered.body?.items?.length);
    check("limit is capped at 200", await req("/api/messages?limit=99999", { token }).then((r) => r.body.items.length <= 200));

    const patched = await req(`/api/messages/${list.body.items[0]._id}`, { method: "PATCH", token, body: JSON.stringify({ status: "read" }) });
    check("PATCH status -> 200", patched.status === 200, patched.body?.error);
    check("PATCH persisted the new status", patched.body?.data?.status === "read");

    const badPatch = await req(`/api/messages/${list.body.items[0]._id}`, { method: "PATCH", token, body: JSON.stringify({ status: "hacked" }) });
    check("PATCH with an invalid status -> 400", badPatch.status === 400);

    const missing = await req("/api/messages/does-not-exist", { method: "PATCH", token, body: JSON.stringify({ status: "read" }) });
    check("PATCH on an unknown id -> 404", missing.status === 404);

    console.log("\n== cors ==");
    const allowed = await req("/api/messages/meta", { origin: "https://manimaran102-cell.github.io" });
    check("allowed origin gets an access-control header", allowed.headers.get("access-control-allow-origin") === "https://manimaran102-cell.github.io", allowed.headers.get("access-control-allow-origin"));

    const blocked = await req("/api/messages/meta", { origin: "https://evil.example" });
    check("unknown origin gets no allow header", blocked.headers.get("access-control-allow-origin") === null, blocked.headers.get("access-control-allow-origin"));

    const fileOrigin = await req("/api/messages/meta", { origin: "null" });
    check("file:// origin (null) is allowed", fileOrigin.headers.get("access-control-allow-origin") === "null");

    console.log("\n== security headers & 404 ==");
    const h = await req("/api/health");
    check("X-Content-Type-Options set", h.headers.get("x-content-type-options") === "nosniff");
    check("X-Powered-By hidden", h.headers.get("x-powered-by") === null);
    const nf = await req("/api/nope");
    check("unknown route -> 404 json", nf.status === 404 && nf.body?.success === false, nf.body);

    console.log("\n== rate limiting ==");
    // 50 allowed in test mode, so the 52nd request must be refused
    let limited = false;
    for (let i = 0; i < 60; i++) {
      const r = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ name: `Spam ${i}` })) });
      if (r.status === 429) { limited = true; break; }
    }
    check("repeated submissions eventually hit the rate limit", limited);
    const limitedRes = await req("/api/messages", { method: "POST", body: JSON.stringify(goodMessage({ name: "Spam final" })) });
    check("rate limited response is 429 with a friendly message", limitedRes.status === 429 && /too many/i.test(String(limitedRes.body?.error)), limitedRes.body);
    check("rate limit sets a Retry-After header", limitedRes.headers.get("retry-after") !== null);

    console.log("\n== server log ==");
    const log = serverOut.join("");
    check("server logged a blocked cors origin", log.includes("blocked origin"), log.slice(0, 400));
    check("server logged the honeypot drop", log.includes("dropped submission"), log.slice(0, 600));
    check("no unexpected errors logged", !/^Error: /m.test(log), (log.match(/^Error: .*/gm) || []).join(" | "));
  } finally {
    server.kill();
    await sleep(300);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${passed} passed, ${failures.length} failed`);
  if (failures.length) failures.forEach((f) => console.log(`   - ${f}`));
  console.log(`${"=".repeat(60)}\n`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("test crashed:", e);
  process.exit(2);
});

// HMAC-signed cookie auth. One password, one signed cookie, 7 day lifetime.
// Cookie format: `<unix-seconds>.<hex-hmac>` where hmac = HMAC-SHA256(timestamp, ADMIN_SECRET)

import type { Env } from "./types";

const COOKIE_NAME = "nr_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function hmacHex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function mintCookie(secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacHex(ts, secret);
  const value = `${ts}.${sig}`;
  return `${COOKIE_NAME}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const raw = readCookie(request, COOKIE_NAME);
  if (!raw) return false;

  const dot = raw.indexOf(".");
  if (dot < 0) return false;

  const ts = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) return false;

  const ageSec = Math.floor(Date.now() / 1000) - tsNum;
  if (ageSec < 0 || ageSec > COOKIE_MAX_AGE) return false;

  const expected = await hmacHex(ts, env.ADMIN_SECRET);
  return constantTimeEqual(sig, expected);
}

export function redirectToLogin(request: Request): Response {
  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?next=${next}` },
  });
}

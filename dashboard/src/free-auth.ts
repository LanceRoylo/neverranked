/**
 * Free-tier auth: magic link + session helpers.
 *
 * Parallel to src/auth.ts but for the free_users table. The
 * magic_links table is shared (no FK to a user table), but
 * sessions are separate (free_sessions vs sessions, because
 * sessions.user_id FK references users which excludes free
 * accounts).
 */

import type { Env } from "./types";

export interface FreeUser {
  id: number;
  email: string;
  domain: string;
  created_at: number;
  last_scan_at: number | null;
  email_alerts: number;
  public_history: number;
  unsub_token: string;
  last_alert_at: number | null;
  upgraded_to_user_id: number | null;
}

const FREE_SESSION_COOKIE = "nr_free";
const FREE_SESSION_MAX_AGE = 90 * 24 * 60 * 60; // 90 days
const MAGIC_LINK_TTL = 15 * 60; // 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60;
const RATE_LIMIT_MAX = 3;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateUnsubToken(): string {
  return randomHex(16);
}

/** Get current free user from cookie, or null. */
export async function getFreeUser(request: Request, env: Env): Promise<FreeUser | null> {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${FREE_SESSION_COOKIE}=([a-f0-9]{64})`));
  if (!match) return null;

  const token = match[1];
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    `SELECT fu.* FROM free_sessions fs
     JOIN free_users fu ON fs.free_user_id = fu.id
     WHERE fs.id = ? AND fs.expires_at > ?`
  ).bind(token, now).first<FreeUser>();

  return row || null;
}

/** Create a magic link for a free user. Returns the token or null
 *  if the email is not registered as a free user or is rate-limited. */
export async function createFreeMagicLink(email: string, env: Env): Promise<string | null> {
  const user = await env.DB.prepare("SELECT id FROM free_users WHERE email = ?").bind(email).first();
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - RATE_LIMIT_WINDOW;
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM email_log WHERE email = ? AND type = 'magic_link' AND created_at > ?"
  ).bind(email, cutoff).first<{ cnt: number }>();
  if (recent && recent.cnt >= RATE_LIMIT_MAX) return null;

  const token = randomHex(32);
  const expiresAt = now + MAGIC_LINK_TTL;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO magic_links (email, token, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).bind(email, token, expiresAt, now),
    env.DB.prepare(
      "INSERT INTO email_log (email, type, created_at) VALUES (?, 'magic_link', ?)"
    ).bind(email, now),
  ]);

  return token;
}

/** Verify a magic link token and create a free session.
 *  The token is looked up in the shared magic_links table; the
 *  email is then matched against free_users (not users). */
export async function verifyFreeMagicLink(
  token: string,
  env: Env
): Promise<{ sessionToken: string; user: FreeUser } | null> {
  const now = Math.floor(Date.now() / 1000);

  const link = await env.DB.prepare(
    "SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > ?"
  ).bind(token, now).first<{ id: number; email: string }>();
  if (!link) return null;

  const user = await env.DB.prepare("SELECT * FROM free_users WHERE email = ?")
    .bind(link.email)
    .first<FreeUser>();
  if (!user) return null;

  await env.DB.prepare("UPDATE magic_links SET used = 1 WHERE id = ?").bind(link.id).run();

  const sessionToken = randomHex(32);
  const expiresAt = now + FREE_SESSION_MAX_AGE;

  await env.DB.prepare(
    "INSERT INTO free_sessions (id, free_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionToken, user.id, expiresAt, now).run();

  return { sessionToken, user };
}

/** Build Set-Cookie header for a free session. */
export function freeSessionCookie(token: string): string {
  return `${FREE_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${FREE_SESSION_MAX_AGE}`;
}

/** Build Set-Cookie header to clear free session. */
export function clearFreeCookie(): string {
  return `${FREE_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Normalize a user-supplied domain. Strip protocol, www, trailing
 *  slash, path, query. Lowercase. Returns null if obviously invalid. */
export function normalizeDomain(input: string): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  if (!d) return null;
  // basic shape check: at least one dot, no spaces, no nonsense
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  // reject obvious junk
  const junk = [
    "localhost",
    "example.com",
    "example.org",
    "test.com",
    "domain.com",
    "yoursite.com",
    "yourdomain.com",
  ];
  if (junk.includes(d)) return null;
  if (d.endsWith(".test") || d.endsWith(".local") || d.endsWith(".localhost")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(d)) return null; // raw IP
  return d;
}

/** Basic email validator. Permissive but rejects nonsense. */
export function normalizeEmail(input: string): string | null {
  if (!input) return null;
  const e = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

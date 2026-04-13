/**
 * Dashboard — Magic link auth + session management
 */

import type { Env, User } from "./types";

const SESSION_COOKIE = "nr_app";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const MAGIC_LINK_TTL = 15 * 60; // 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes
const RATE_LIMIT_MAX = 3;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Get current user from session cookie, or null */
export async function getUser(request: Request, env: Env): Promise<User | null> {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]{64})`));
  if (!match) return null;

  const token = match[1];
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.client_slug, u.onboarded, u.email_digest, u.stripe_customer_id, u.stripe_subscription_id, u.plan, u.created_at, u.last_login_at
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > ?`
  ).bind(token, now).first<User>();

  return row || null;
}

/** Create a magic link token for an email */
export async function createMagicLink(email: string, env: Env): Promise<string | null> {
  // Check user exists
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) return null;

  // Rate limit
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - RATE_LIMIT_WINDOW;
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM email_log WHERE email = ? AND created_at > ?"
  ).bind(email, cutoff).first<{ cnt: number }>();
  if (recent && recent.cnt >= RATE_LIMIT_MAX) return null;

  // Generate token
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

/** Verify a magic link token and create a session */
export async function verifyMagicLink(
  token: string,
  env: Env
): Promise<{ sessionToken: string; user: User } | null> {
  const now = Math.floor(Date.now() / 1000);

  const link = await env.DB.prepare(
    "SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > ?"
  ).bind(token, now).first<{ id: number; email: string }>();

  if (!link) return null;

  // Mark as used
  await env.DB.prepare("UPDATE magic_links SET used = 1 WHERE id = ?").bind(link.id).run();

  // Get user
  const user = await env.DB.prepare(
    "SELECT id, email, name, role, client_slug, onboarded, email_digest, stripe_customer_id, stripe_subscription_id, plan, created_at, last_login_at FROM users WHERE email = ?"
  ).bind(link.email).first<User>();
  if (!user) return null;

  // Create session
  const sessionToken = randomHex(32);
  const expiresAt = now + SESSION_MAX_AGE;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).bind(sessionToken, user.id, expiresAt, now),
    env.DB.prepare(
      "UPDATE users SET last_login_at = ? WHERE id = ?"
    ).bind(now, user.id),
  ]);

  return { sessionToken, user };
}

/** Delete a session */
export async function deleteSession(request: Request, env: Env): Promise<void> {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]{64})`));
  if (match) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(match[1]).run();
  }
}

/** Build Set-Cookie header for a session */
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

/** Build Set-Cookie header to clear session */
export function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Clean up expired sessions and used magic links */
export async function cleanupAuth(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM magic_links WHERE (used = 1 OR expires_at < ?) AND created_at < ?").bind(now, dayAgo),
  ]);
}

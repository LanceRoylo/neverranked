/**
 * Admin: grant a customer access to their dashboard + Atlas.
 *
 * /admin/grant-access?email=...&slug=...&name=...
 *
 * One click provisions the customer user (idempotent) and emails them a
 * sign-in link. This is the "Greg says yes" button: it makes the live
 * Atlas surface reachable for a real customer without manual DB work or
 * telling them to go hunt for a login page.
 *
 * Notes:
 * - The user is created with role 'client' bound to the slug, which is
 *   exactly what /c/<slug>/ and /c/<slug>/atlas authorize against.
 * - The magic-link email is auth mail: it sends even while the global
 *   customer-email pause is on (verified in email.ts), so access is never
 *   blocked by the pause.
 * - The link uses a 72-hour TTL (not the default 15 min) so a customer
 *   who opens their inbox later in the day still gets in. Mirrors the
 *   post-checkout welcome flow.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";
import { createMagicLink } from "../auth";
import { sendMagicLinkEmail } from "../email";

const INVITE_TTL_SECONDS = 72 * 3600;

export async function handleGrantAccess(user: User, env: Env, url: URL): Promise<Response> {
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  const name = (url.searchParams.get("name") || "").trim() || null;

  const wrap = (inner: string) =>
    html(layout("Grant access", `<p><a href="/admin/memos" style="color:var(--dim)">&larr; Admin</a></p>${inner}`, user));

  if (!email || !slug) {
    return wrap(`<h1 style="font-weight:400">Grant customer access</h1>
      <p style="color:var(--dim)">Provisions a customer login and emails a sign-in link.</p>
      <p>Usage: <code>/admin/grant-access?email=person@example.com&amp;slug=hawaii-theatre&amp;name=Greg</code></p>
      <p style="color:var(--dim)">Note: if the email has a + alias, encode it as %2B in the URL (a raw + becomes a space).</p>`);
  }

  // Validate the email before doing anything. A raw "+" in the URL decodes
  // to a space, which would create a junk user and a 422 from the mailer.
  // Reject obviously-invalid addresses up front rather than provisioning
  // something that can never sign in.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return wrap(`<h1 style="font-weight:400">Invalid email</h1>
      <p style="color:#e8a0a0">"${esc(email)}" is not a valid email address. If it has a + alias, encode the + as %2B in the URL (a raw + is read as a space).</p>`);
  }

  // Confirm the slug is a real customer before granting access to it.
  const customer = await env.DB.prepare(
    `SELECT name FROM customers WHERE client_slug = ?`
  ).bind(slug).first<{ name: string }>();
  if (!customer) {
    return wrap(`<h1 style="font-weight:400">No such customer</h1>
      <p style="color:#e8a0a0">No customer with slug <code>${esc(slug)}</code> exists. Create the customer first.</p>`);
  }

  // Provision (idempotent). If the email already exists, make sure it is
  // bound to this slug as a client. Never downgrade an existing admin.
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    `SELECT id, role, client_slug FROM users WHERE email = ?`
  ).bind(email).first<{ id: number; role: string; client_slug: string | null }>();

  if (existing && existing.role === "admin") {
    return wrap(`<h1 style="font-weight:400">That email is an admin</h1>
      <p style="color:#e8a0a0">${esc(email)} is an admin account. Use a separate customer email rather than re-binding an admin to a client slug.</p>`);
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET client_slug = ?, role = 'client', name = COALESCE(name, ?) WHERE id = ?`
    ).bind(slug, name, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (email, name, role, client_slug, created_at) VALUES (?, ?, 'client', ?, ?)`
    ).bind(email, name, slug, now).run();
  }

  // Issue a long-lived sign-in link and email it.
  const token = await createMagicLink(email, env, INVITE_TTL_SECONDS);
  if (!token) {
    return wrap(`<h1 style="font-weight:400">User provisioned, link not sent</h1>
      <p style="color:#e8c767">${esc(email)} is now bound to ${esc(customer.name)}, but the sign-in link could not be created (rate limit, or send throttled). They can sign in at <code>app.neverranked.com/login</code> with this email, or retry this in a minute.</p>`);
  }
  const sent = await sendMagicLinkEmail(email, token, env);

  return wrap(`<h1 style="font-weight:400">${sent ? "Access granted" : "Provisioned, email failed"}</h1>
    <p>${esc(email)} is now a client of <strong>${esc(customer.name)}</strong> (<code>${esc(slug)}</code>).</p>
    ${sent
      ? `<p style="color:#7bdca0">A sign-in link was emailed to them (valid 72 hours). When they click it they land in their dashboard and can open Atlas at <code>/c/${esc(slug)}/atlas</code>.</p>`
      : `<p style="color:#e8a0a0">The user was provisioned but the sign-in email failed to send. They can sign in at <code>app.neverranked.com/login</code> with their email.</p>`}`);
}

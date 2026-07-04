/**
 * Admin: grant a customer access to their dashboard + Atlas.
 *
 * GET  /admin/grant-access            -> renders the form (NO side effects)
 * POST /admin/grant-access (form)     -> provisions + emails a sign-in link
 *
 * Provisions the customer user (idempotent) and emails a sign-in link. This is
 * the "customer says yes" button: it makes the live cockpit + Atlas reachable
 * for a real customer without manual DB work.
 *
 * CSRF: the mutation + auth-mail send is POST-only behind a same-origin check.
 * A GET must never mutate users or send mail (it did before — a crafted link an
 * admin merely loaded could provision an attacker as a client of any slug and
 * hand them a sign-in link to that customer's confidential cockpit).
 *
 * Notes:
 * - The user is created with role 'client' bound to the slug, which is
 *   exactly what /c/<slug>/ and /c/<slug>/atlas authorize against.
 * - The magic-link email is auth mail: it sends even while the global
 *   customer-email pause is on, so access is never blocked by the pause.
 * - The link uses a 72-hour TTL so a customer who opens their inbox later
 *   in the day still gets in.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";
import { createMagicLink } from "../auth";
import { sendMagicLinkEmail } from "../email";

const INVITE_TTL_SECONDS = 72 * 3600;

function wrapPage(user: User, inner: string): Response {
  return html(layout("Grant access", `<p><a href="/admin/memos" style="color:var(--dim)">&larr; Admin</a></p>${inner}`, user));
}

/** GET — render the form only. No mutation, no email (that would be CSRF-able
 *  on a GET). Query params pre-fill the fields for convenience. */
export function handleGrantAccess(user: User, _env: Env, url: URL): Response {
  const email = esc((url.searchParams.get("email") || "").trim());
  const slug = esc((url.searchParams.get("slug") || "").trim());
  const name = esc((url.searchParams.get("name") || "").trim());
  const err = url.searchParams.get("error");
  return wrapPage(user, `
    <h1 style="font-weight:400">Grant customer access</h1>
    <p style="color:var(--dim)">Provisions a customer login (idempotent) and emails a 72-hour sign-in link.</p>
    ${err ? `<p style="color:#e8a0a0">${esc(err)}</p>` : ""}
    <form method="POST" action="/admin/grant-access" style="display:flex;flex-direction:column;gap:12px;max-width:440px;margin-top:12px">
      <label>Email<br><input name="email" type="email" required value="${email}" placeholder="person@example.com" style="width:100%;padding:8px"></label>
      <label>Customer slug<br><input name="slug" required value="${slug}" placeholder="hawaii-theatre" style="width:100%;padding:8px"></label>
      <label>Name (optional)<br><input name="name" value="${name}" placeholder="Greg" style="width:100%;padding:8px"></label>
      <button type="submit" style="padding:9px 16px">Provision + email sign-in link</button>
    </form>`);
}

/** POST — perform the provisioning + email. Same-origin only. */
export async function handleGrantAccessPost(request: Request, user: User, env: Env): Promise<Response> {
  // CSRF defense: this endpoint mutates users AND sends auth mail, so reject
  // any cross-origin POST. Mirrors the check in admin-email-test.ts.
  const allowedOrigins = new Set([
    env.DASHBOARD_ORIGIN || "https://app.neverranked.com",
    "https://app.neverranked.com",
    "https://neverranked-dashboard.lanceroylo.workers.dev",
  ]);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  let sameOrigin = false;
  if (origin && allowedOrigins.has(origin)) sameOrigin = true;
  if (referer) {
    try { if (allowedOrigins.has(new URL(referer).origin)) sameOrigin = true; } catch { /* bad referer -> cross-origin */ }
  }
  if (!sameOrigin) return new Response("Cross-origin POST rejected", { status: 403 });

  const form = await request.formData();
  const email = ((form.get("email") as string) || "").trim().toLowerCase();
  const slug = ((form.get("slug") as string) || "").trim().toLowerCase();
  const name = ((form.get("name") as string) || "").trim() || null;

  const back = `<p style="margin-top:16px"><a href="/admin/grant-access" style="color:var(--dim)">&larr; Back to form</a></p>`;
  if (!email || !slug) {
    return wrapPage(user, `<h1 style="font-weight:400">Missing email or slug</h1><p style="color:#e8a0a0">Both fields are required.</p>${back}`);
  }
  // A raw "+" in a form field is fine (not URL-decoded to space here), but keep
  // the validity check to reject junk before provisioning a user that can never sign in.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return wrapPage(user, `<h1 style="font-weight:400">Invalid email</h1><p style="color:#e8a0a0">"${esc(email)}" is not a valid email address.</p>${back}`);
  }

  const customer = await env.DB.prepare(
    `SELECT name FROM customers WHERE client_slug = ?`,
  ).bind(slug).first<{ name: string }>();
  if (!customer) {
    return wrapPage(user, `<h1 style="font-weight:400">No such customer</h1><p style="color:#e8a0a0">No customer with slug <code>${esc(slug)}</code> exists. Create the customer first.</p>${back}`);
  }

  // Provision (idempotent). Never downgrade an existing admin.
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    `SELECT id, role, client_slug FROM users WHERE email = ?`,
  ).bind(email).first<{ id: number; role: string; client_slug: string | null }>();

  if (existing && existing.role === "admin") {
    return wrapPage(user, `<h1 style="font-weight:400">That email is an admin</h1><p style="color:#e8a0a0">${esc(email)} is an admin account. Use a separate customer email rather than re-binding an admin to a client slug.</p>${back}`);
  }
  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET client_slug = ?, role = 'client', name = COALESCE(name, ?) WHERE id = ?`,
    ).bind(slug, name, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (email, name, role, client_slug, created_at) VALUES (?, ?, 'client', ?, ?)`,
    ).bind(email, name, slug, now).run();
  }

  const token = await createMagicLink(email, env, INVITE_TTL_SECONDS);
  if (!token) {
    return wrapPage(user, `<h1 style="font-weight:400">User provisioned, link not sent</h1><p style="color:#e8c767">${esc(email)} is now bound to ${esc(customer.name)}, but the sign-in link could not be created (rate limit, or send throttled). They can sign in at <code>app.neverranked.com/login</code> with this email, or retry in a minute.</p>${back}`);
  }
  const sent = await sendMagicLinkEmail(email, token, env);

  return wrapPage(user, `<h1 style="font-weight:400">${sent ? "Access granted" : "Provisioned, email failed"}</h1>
    <p>${esc(email)} is now a client of <strong>${esc(customer.name)}</strong> (<code>${esc(slug)}</code>).</p>
    ${sent
      ? `<p style="color:#7bdca0">A sign-in link was emailed to them (valid 72 hours). When they click it they land in their dashboard and can open Atlas at <code>/c/${esc(slug)}/atlas</code>.</p>`
      : `<p style="color:#e8a0a0">The user was provisioned but the sign-in email failed to send. They can sign in at <code>app.neverranked.com/login</code> with their email.</p>`}${back}`);
}

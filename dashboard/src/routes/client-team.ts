/**
 * Client team management — invite teammates for direct (non-agency)
 * retail customers.
 *
 * Mirrors the shape of routes/agency-invites.ts but scoped to
 * user.client_slug rather than user.agency_id. Reuses the
 * agency_invites table (agency_id nullable per migration 0069) and
 * the existing handleInviteAccept flow.
 *
 * Surfaces:
 *   GET  /team               — list teammates + invite form
 *   POST /team/invite        — send invite to a teammate (same client_slug)
 *   POST /team/invite/:id/resend
 *   POST /team/invite/:id/revoke
 */

import type { Env, User } from "../types";
import { html, layout, redirect, esc } from "../render";
import { sendInviteEmail } from "../email";

const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ROOT = "https://app.neverranked.com";

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(token: string): string {
  return `${ROOT}/auth/invite?token=${token}`;
}

interface TeamMemberRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  last_login_at: number | null;
  created_at: number;
}

interface PendingInviteRow {
  id: number;
  email: string;
  expires_at: number;
  created_at: number;
}

/**
 * Direct retail clients only. Block agency-managed clients (their
 * teammate management lives at /agency/invites).
 */
function requireDirectClient(user: User): Response | null {
  if (!user.client_slug) {
    return redirect("/?error=" + encodeURIComponent("Team management requires a client account."));
  }
  if (user.agency_id) {
    return redirect("/?error=" + encodeURIComponent("Your agency manages teammate access. Contact your agency admin."));
  }
  return null;
}

export async function handleTeamGet(user: User, env: Env, url: URL): Promise<Response> {
  const guard = requireDirectClient(user);
  if (guard) return guard;

  const flash = url.searchParams.get("flash");
  const error = url.searchParams.get("error");

  // Existing teammates: users with the same client_slug, excluding self.
  const teammates = (await env.DB.prepare(
    `SELECT id, email, name, role, last_login_at, created_at
       FROM users
       WHERE client_slug = ? AND id != ? AND agency_id IS NULL
       ORDER BY created_at ASC`
  ).bind(user.client_slug, user.id).all<TeamMemberRow>()).results;

  // Pending invites for this client_slug.
  const pending = (await env.DB.prepare(
    `SELECT id, email, expires_at, created_at
       FROM agency_invites
       WHERE client_slug = ? AND agency_id IS NULL AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC`
  ).bind(user.client_slug, Math.floor(Date.now() / 1000)).all<PendingInviteRow>()).results;

  const flashHtml = flash
    ? `<div style="margin-bottom:24px;padding:14px 20px;background:rgba(127,201,154,.08);border:1px solid var(--ok);border-radius:4px;font-size:13px;color:var(--ok)">${esc(flash)}</div>`
    : "";

  const errorHtml = error
    ? `<div style="margin-bottom:24px;padding:14px 20px;background:rgba(255,120,120,.08);border:1px solid var(--err);border-radius:4px;font-size:13px;color:var(--err)">${esc(error)}</div>`
    : "";

  const teammatesRows = teammates.length === 0
    ? `<div style="padding:14px 20px;background:var(--bg-edge);border-radius:4px;font-size:12px;color:var(--text-faint)">You are the only person on the account. Invite a teammate below to add another.</div>`
    : teammates.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">
          <div>
            <div style="font-size:14px;color:var(--text)">${esc(t.email)}</div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:2px">
              ${t.name ? esc(t.name) + " · " : ""}Joined ${new Date(t.created_at * 1000).toLocaleDateString()}${t.last_login_at ? ` · last seen ${new Date(t.last_login_at * 1000).toLocaleDateString()}` : ""}
            </div>
          </div>
          <span class="status status-done">${esc(t.role)}</span>
        </div>
      `).join("");

  const pendingRows = pending.length === 0 ? "" : `
    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Pending invites</div>
      ${pending.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">
          <div>
            <div style="font-size:14px;color:var(--text)">${esc(p.email)}</div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:2px">
              Sent ${new Date(p.created_at * 1000).toLocaleDateString()} · expires ${new Date(p.expires_at * 1000).toLocaleDateString()}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <form method="POST" action="/team/invite/${p.id}/resend" style="margin:0">
              <button type="submit" class="btn btn-secondary" style="font-size:11px;padding:6px 12px">Resend</button>
            </form>
            <form method="POST" action="/team/invite/${p.id}/revoke" style="margin:0" onsubmit="return confirm('Revoke this invite?')">
              <button type="submit" class="btn btn-secondary" style="font-size:11px;padding:6px 12px;color:var(--err);border-color:var(--err)">Revoke</button>
            </form>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/settings" style="color:var(--text-mute)">← Settings</a>
      </div>
      <h1><em>Team members</em></h1>
      <p style="color:var(--text-faint);font-size:13px;margin-top:8px;max-width:520px;line-height:1.6">
        Invite teammates to access your NeverRanked dashboard. They will see the same scans, roadmap, and reports you do.
      </p>
    </div>

    ${flashHtml}
    ${errorHtml}

    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Active teammates</div>
      ${teammatesRows}
    </div>

    ${pendingRows}

    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Invite a teammate</div>
      <form method="POST" action="/team/invite">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div>
            <label style="display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px;font-family:var(--label)">Name (optional)</label>
            <input type="text" name="name" placeholder="Jane Doe" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px 12px;font-family:var(--mono);font-size:13px;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px;font-family:var(--label)">Email</label>
            <input type="email" name="email" required placeholder="jane@example.com" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px 12px;font-family:var(--mono);font-size:13px;outline:none">
          </div>
        </div>
        <button type="submit" class="cta-button" style="padding:10px 28px;font-size:12px;letter-spacing:.06em">Send invite</button>
        <p style="font-size:11px;color:var(--text-faint);margin:12px 0 0">Invitee gets an email with a 7-day sign-in link. They land directly in your dashboard, no password required.</p>
      </form>
    </div>
  `;

  return html(layout("Team", body, user));
}

export async function handleTeamInvite(request: Request, user: User, env: Env): Promise<Response> {
  const guard = requireDirectClient(user);
  if (guard) return guard;

  const form = await request.formData();
  const email = (form.get("email") as string || "").trim().toLowerCase();
  const name = (form.get("name") as string || "").trim();

  if (!email || !email.includes("@")) {
    return redirect("/team?error=" + encodeURIComponent("Please enter a valid email address."));
  }

  // Reject if already a teammate or active user with that email.
  const existing = await env.DB.prepare(
    "SELECT id, client_slug FROM users WHERE email = ?"
  ).bind(email).first<{ id: number; client_slug: string | null }>();

  if (existing && existing.client_slug === user.client_slug) {
    return redirect("/team?error=" + encodeURIComponent(`${email} is already a teammate on this account.`));
  }

  // Reject if there is already a pending invite to this email for this client.
  const pendingDup = await env.DB.prepare(
    `SELECT id FROM agency_invites
       WHERE email = ? AND client_slug = ? AND agency_id IS NULL
         AND used_at IS NULL AND expires_at > ?`
  ).bind(email, user.client_slug, Math.floor(Date.now() / 1000)).first();

  if (pendingDup) {
    return redirect("/team?error=" + encodeURIComponent(`There is already a pending invite to ${email}. Use Resend to refresh it.`));
  }

  const now = Math.floor(Date.now() / 1000);
  const token = randomHex(32);
  const expiresAt = now + INVITE_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO agency_invites
       (agency_id, email, role, client_slug, token, expires_at, invited_by, created_at)
       VALUES (NULL, ?, 'client', ?, ?, ?, ?, ?)`
  ).bind(email, user.client_slug, token, expiresAt, user.id, now).run();

  // Reuse sendInviteEmail with a synthetic agency-shaped object — the
  // template uses the brand name and inviter; both work for direct
  // clients with a "Hawaii Theatre Center" branding fallback.
  const brandName = user.client_slug
    ? user.client_slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")
    : "NeverRanked";

  await sendInviteEmail(email, inviteUrl(token), env, {
    agency: { id: 0, name: brandName, slug: user.client_slug || "client" } as any,
    role: "client",
    inviterName: user.name || user.email,
    clientSlug: user.client_slug,
  });

  return redirect("/team?flash=" + encodeURIComponent(`Invite sent to ${email}. Link is good for 7 days.`));
}

export async function handleTeamInviteResend(inviteId: number, user: User, env: Env): Promise<Response> {
  const guard = requireDirectClient(user);
  if (guard) return guard;

  const invite = await env.DB.prepare(
    `SELECT id, email, client_slug FROM agency_invites
       WHERE id = ? AND client_slug = ? AND agency_id IS NULL AND used_at IS NULL`
  ).bind(inviteId, user.client_slug).first<{ id: number; email: string; client_slug: string }>();

  if (!invite) {
    return redirect("/team?error=" + encodeURIComponent("Invite not found or already used."));
  }

  // Refresh expiry by 7 days from now.
  const now = Math.floor(Date.now() / 1000);
  const newToken = randomHex(32);
  const newExpiry = now + INVITE_TTL_SECONDS;
  await env.DB.prepare(
    "UPDATE agency_invites SET token = ?, expires_at = ? WHERE id = ?"
  ).bind(newToken, newExpiry, invite.id).run();

  const brandName = user.client_slug
    ? user.client_slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")
    : "NeverRanked";

  await sendInviteEmail(invite.email, inviteUrl(newToken), env, {
    agency: { id: 0, name: brandName, slug: user.client_slug || "client" } as any,
    role: "client",
    inviterName: user.name || user.email,
    clientSlug: user.client_slug,
  });

  return redirect("/team?flash=" + encodeURIComponent(`Invite resent to ${invite.email}.`));
}

export async function handleTeamInviteRevoke(inviteId: number, user: User, env: Env): Promise<Response> {
  const guard = requireDirectClient(user);
  if (guard) return guard;

  await env.DB.prepare(
    `UPDATE agency_invites SET used_at = ?
       WHERE id = ? AND client_slug = ? AND agency_id IS NULL`
  ).bind(Math.floor(Date.now() / 1000), inviteId, user.client_slug).run();

  return redirect("/team?flash=" + encodeURIComponent("Invite revoked."));
}

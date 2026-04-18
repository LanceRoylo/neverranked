/**
 * Dashboard -- Agency invites
 *
 * Routes:
 *   GET  /agency/invites          -> list + two invite forms (teammate / client)
 *   POST /agency/invites/teammate -> create agency_admin invite
 *   POST /agency/invites/client   -> create client invite (binds to one of agency's domains)
 *   POST /agency/invites/:id/revoke -> delete a pending invite
 *   POST /agency/invites/:id/resend -> rotate token + email again
 *   GET  /auth/invite?token=...   -> invitee clicks link, user is created/linked, session starts
 *
 * Why a separate flow from /auth/verify (magic links):
 *   - Magic links expire in 15 min; invite links need ~7 days
 *   - Magic links require an existing users row; invites must CREATE the
 *     user (with the right role/agency_id/client_slug) on first click
 *   - Invites carry binding metadata (which agency, which client_slug,
 *     which role) that magic_links can't represent
 *
 * Once an invite is consumed, future logins for that email use the regular
 * magic link flow at /login.
 */

import type { Agency, Domain, Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { getAgency, listAgencyClients } from "../agency";
import { sessionCookie } from "../auth";
import { sendInviteEmail } from "../email";
import { logEvent } from "../analytics";

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(token: string): string {
  return `https://app.neverranked.com/auth/invite?token=${token}`;
}

interface InviteRow {
  id: number;
  agency_id: number;
  email: string;
  role: "agency_admin" | "client";
  client_slug: string | null;
  token: string;
  expires_at: number;
  used_at: number | null;
  invited_by: number | null;
  created_at: number;
}

async function requireAgencyAdmin(user: User | null, env: Env): Promise<{ agency: Agency } | Response> {
  if (!user) return new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "agency_admin" || !user.agency_id) {
    return new Response("Forbidden", { status: 403 });
  }
  const agency = await getAgency(env, user.agency_id);
  if (!agency) return new Response("Agency not found", { status: 404 });
  return { agency };
}

// ---------------------------------------------------------------------------
// GET /agency/invites
// ---------------------------------------------------------------------------

export async function handleAgencyInvitesGet(user: User | null, env: Env, url: URL): Promise<Response> {
  const guard = await requireAgencyAdmin(user, env);
  if (guard instanceof Response) return guard;
  const { agency } = guard;

  const flash = url.searchParams.get("flash");
  const flashError = url.searchParams.get("error");

  const now = Math.floor(Date.now() / 1000);
  const pending = (await env.DB.prepare(
    `SELECT * FROM agency_invites
       WHERE agency_id = ? AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC`
  ).bind(agency.id, now).all<InviteRow>()).results;

  const accepted = (await env.DB.prepare(
    `SELECT * FROM agency_invites
       WHERE agency_id = ? AND used_at IS NOT NULL
       ORDER BY used_at DESC LIMIT 10`
  ).bind(agency.id).all<InviteRow>()).results;

  const clients = await listAgencyClients(env, agency.id);
  const activeClients = clients.filter((c: Domain) => c.active);

  const flashBlock = flash
    ? `<div class="flash">${esc(flash)}</div>`
    : flashError
    ? `<div class="flash flash-error">${esc(flashError)}</div>`
    : "";

  const clientOptions = activeClients.length === 0
    ? `<option value="">No active clients yet -- add a domain first</option>`
    : activeClients.map((c: Domain) =>
        `<option value="${esc(c.client_slug)}">${esc(c.client_slug)} -- ${esc(c.domain)}</option>`
      ).join("");

  const renderInviteRow = (r: InviteRow): string => {
    const ageMin = Math.floor((now - r.created_at) / 60);
    const ageLabel = ageMin < 60 ? `${ageMin}m ago`
      : ageMin < 1440 ? `${Math.floor(ageMin / 60)}h ago`
      : `${Math.floor(ageMin / 1440)}d ago`;
    const expiresIn = Math.max(0, Math.floor((r.expires_at - now) / 86400));
    const expiresLabel = r.used_at
      ? `Accepted ${formatRelative(now - r.used_at)}`
      : `Expires in ${expiresIn}d`;
    const roleLabel = r.role === "client"
      ? `Client (${esc(r.client_slug || "?")})`
      : "Teammate";

    const link = `https://app.neverranked.com/auth/invite?token=${r.token}`;
    const actions = r.used_at
      ? ""
      : `
        <button type="button" class="btn btn-ghost copy-link-btn"
                data-link="${esc(link)}"
                style="padding:4px 10px;font-size:11px"
                title="Copy invite link to clipboard">Copy link</button>
        <form method="POST" action="/agency/invites/${r.id}/resend" style="display:inline;margin:0;margin-left:6px">
          <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:11px">Resend</button>
        </form>
        <form method="POST" action="/agency/invites/${r.id}/revoke" style="display:inline;margin:0;margin-left:6px"
              onsubmit="return confirm('Revoke this invite?')">
          <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--danger)">Revoke</button>
        </form>
      `;

    return `
      <tr>
        <td>${esc(r.email)}</td>
        <td>${roleLabel}</td>
        <td class="muted">${esc(ageLabel)}</td>
        <td class="muted">${esc(expiresLabel)}</td>
        <td>${actions}</td>
      </tr>
    `;
  };

  const pendingTable = pending.length === 0
    ? `<p class="muted">No pending invites.</p>`
    : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Sent</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${pending.map(renderInviteRow).join("")}</tbody>
        </table>
      </div>
    `;

  const acceptedTable = accepted.length === 0
    ? ""
    : `
      <h3 style="margin-top:32px;margin-bottom:12px">Recently accepted</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Sent</th>
              <th>Accepted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${accepted.map(renderInviteRow).join("")}</tbody>
        </table>
      </div>
    `;

  const body = `
    <div class="section-header">
      <h1>Invites</h1>
      <p class="section-sub">Add teammates to manage clients with you, or invite clients into a Mode-2 portal.</p>
    </div>

    ${flashBlock}

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-bottom:32px">
      <div class="card">
        <h3 style="margin-top:0">Invite a teammate</h3>
        <p class="muted" style="font-size:13px;margin-bottom:16px">
          Teammates can manage every client on this account.
        </p>
        <form method="POST" action="/agency/invites/teammate">
          <div class="form-group">
            <label for="t-email">Email</label>
            <input id="t-email" name="email" type="email" required maxlength="200" placeholder="teammate@${esc(agency.slug)}.com">
          </div>
          <div class="form-group">
            <label for="t-name">Name (optional)</label>
            <input id="t-name" name="name" type="text" maxlength="80" placeholder="Their full name">
          </div>
          <button type="submit" class="btn">Send invite</button>
        </form>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Invite a client</h3>
        <p class="muted" style="font-size:13px;margin-bottom:16px">
          Client logs in to a portal showing only their own domain, with your branding.
        </p>
        <form method="POST" action="/agency/invites/client">
          <div class="form-group">
            <label for="c-email">Email</label>
            <input id="c-email" name="email" type="email" required maxlength="200" placeholder="client@example.com">
          </div>
          <div class="form-group">
            <label for="c-name">Name (optional)</label>
            <input id="c-name" name="name" type="text" maxlength="80" placeholder="Their full name">
          </div>
          <div class="form-group">
            <label for="c-slug">Client account</label>
            <select id="c-slug" name="client_slug" required ${activeClients.length === 0 ? "disabled" : ""}>
              ${clientOptions}
            </select>
          </div>
          <button type="submit" class="btn" ${activeClients.length === 0 ? "disabled" : ""}>Send invite</button>
        </form>
      </div>
    </div>

    <h3 style="margin-bottom:12px">Pending invites</h3>
    ${pendingTable}
    ${acceptedTable}

    <script>
      // Copy invite link to clipboard. Falls back to a temporary
      // textarea + execCommand for browsers without secure clipboard
      // access (HTTP, ancient browsers).
      document.querySelectorAll('.copy-link-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var link = btn.getAttribute('data-link');
          if (!link) return;
          var done = function(){
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function(){ btn.textContent = orig; }, 1500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(done).catch(function(){
              window.prompt('Copy this invite link:', link);
            });
          } else {
            var ta = document.createElement('textarea');
            ta.value = link;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch(e) {
              window.prompt('Copy this invite link:', link);
            }
            document.body.removeChild(ta);
          }
        });
      });
    </script>
  `;

  return html(layout("Invites", body, user));
}

function formatRelative(deltaSec: number): string {
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Invite creation
// ---------------------------------------------------------------------------

async function createInvite(
  env: Env,
  agency: Agency,
  invitedBy: User,
  opts: { email: string; name: string; role: "agency_admin" | "client"; clientSlug: string | null }
): Promise<{ token: string }> {
  const now = Math.floor(Date.now() / 1000);
  const token = randomHex(32);
  const expiresAt = now + INVITE_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO agency_invites
       (agency_id, email, role, client_slug, token, expires_at, invited_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    agency.id, opts.email, opts.role, opts.clientSlug,
    token, expiresAt, invitedBy.id, now,
  ).run();

  return { token };
}

export async function handleInviteTeammate(request: Request, user: User | null, env: Env): Promise<Response> {
  const guard = await requireAgencyAdmin(user, env);
  if (guard instanceof Response) return guard;
  const { agency } = guard;

  const form = await request.formData();
  const email = (form.get("email") as string || "").trim().toLowerCase();
  const name = (form.get("name") as string || "").trim();

  if (!email || !email.includes("@")) {
    return redirect("/agency/invites?error=" + encodeURIComponent("Please enter a valid email."));
  }

  const { token } = await createInvite(env, agency, user!, {
    email, name, role: "agency_admin", clientSlug: null,
  });
  await sendInviteEmail(email, inviteUrl(token), env, {
    agency, role: "agency_admin", inviterName: user!.name, clientSlug: null,
  });

  return redirect("/agency/invites?flash=" + encodeURIComponent(`Invite sent to ${email}.`));
}

export async function handleInviteClient(request: Request, user: User | null, env: Env): Promise<Response> {
  const guard = await requireAgencyAdmin(user, env);
  if (guard instanceof Response) return guard;
  const { agency } = guard;

  const form = await request.formData();
  const email = (form.get("email") as string || "").trim().toLowerCase();
  const name = (form.get("name") as string || "").trim();
  const clientSlug = (form.get("client_slug") as string || "").trim();

  if (!email || !email.includes("@") || !clientSlug) {
    return redirect("/agency/invites?error=" + encodeURIComponent("Please pick a client and enter a valid email."));
  }

  // Verify client_slug actually belongs to this agency.
  const owns = await env.DB.prepare(
    "SELECT 1 FROM domains WHERE client_slug = ? AND agency_id = ? AND is_competitor = 0 LIMIT 1"
  ).bind(clientSlug, agency.id).first();
  if (!owns) {
    return redirect("/agency/invites?error=" + encodeURIComponent("That client doesn't belong to your agency."));
  }

  const { token } = await createInvite(env, agency, user!, {
    email, name, role: "client", clientSlug,
  });
  await sendInviteEmail(email, inviteUrl(token), env, {
    agency, role: "client", inviterName: user!.name, clientSlug,
  });

  return redirect("/agency/invites?flash=" + encodeURIComponent(`Invite sent to ${email}.`));
}

// ---------------------------------------------------------------------------
// Resend / revoke
// ---------------------------------------------------------------------------

export async function handleInviteResend(inviteId: number, user: User | null, env: Env): Promise<Response> {
  const guard = await requireAgencyAdmin(user, env);
  if (guard instanceof Response) return guard;
  const { agency } = guard;

  const invite = await env.DB.prepare(
    "SELECT * FROM agency_invites WHERE id = ? AND agency_id = ?"
  ).bind(inviteId, agency.id).first<InviteRow>();
  if (!invite || invite.used_at) {
    return redirect("/agency/invites?error=" + encodeURIComponent("Invite not found or already accepted."));
  }

  const now = Math.floor(Date.now() / 1000);
  const newToken = randomHex(32);
  const newExpires = now + INVITE_TTL_SECONDS;
  await env.DB.prepare(
    "UPDATE agency_invites SET token = ?, expires_at = ?, created_at = ? WHERE id = ?"
  ).bind(newToken, newExpires, now, inviteId).run();

  await sendInviteEmail(invite.email, inviteUrl(newToken), env, {
    agency, role: invite.role, inviterName: user!.name, clientSlug: invite.client_slug,
  });

  return redirect("/agency/invites?flash=" + encodeURIComponent(`Invite resent to ${invite.email}.`));
}

export async function handleInviteRevoke(inviteId: number, user: User | null, env: Env): Promise<Response> {
  const guard = await requireAgencyAdmin(user, env);
  if (guard instanceof Response) return guard;
  const { agency } = guard;

  await env.DB.prepare(
    "DELETE FROM agency_invites WHERE id = ? AND agency_id = ? AND used_at IS NULL"
  ).bind(inviteId, agency.id).run();

  return redirect("/agency/invites?flash=" + encodeURIComponent("Invite revoked."));
}

// ---------------------------------------------------------------------------
// GET /auth/invite?token=...
// ---------------------------------------------------------------------------

export async function handleInviteAccept(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token || token.length !== 64) {
    return invalidInviteResponse();
  }

  const now = Math.floor(Date.now() / 1000);
  const invite = await env.DB.prepare(
    "SELECT * FROM agency_invites WHERE token = ? AND used_at IS NULL AND expires_at > ?"
  ).bind(token, now).first<InviteRow>();
  if (!invite) return invalidInviteResponse();

  // Find or create the user.
  let user = await env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(invite.email).first<User>();

  if (user) {
    // Existing user: upgrade their binding. Don't downgrade if they're
    // already an admin of something stronger.
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (user.role !== "admin") {
      updates.push("role = ?"); values.push(invite.role);
    }
    updates.push("agency_id = ?"); values.push(invite.agency_id);
    if (invite.role === "client" && invite.client_slug) {
      updates.push("client_slug = ?"); values.push(invite.client_slug);
    }
    values.push(user.id);
    await env.DB.prepare(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...values).run();
  } else {
    const insertResult = await env.DB.prepare(
      `INSERT INTO users (email, role, client_slug, agency_id, email_digest, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
    ).bind(
      invite.email,
      invite.role,
      invite.role === "client" ? invite.client_slug : null,
      invite.agency_id,
      now,
    ).run();
    const newId = (insertResult.meta as { last_row_id?: number }).last_row_id;
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(newId).first<User>();
  }
  if (!user) return invalidInviteResponse();

  // Mark invite consumed.
  await env.DB.prepare(
    "UPDATE agency_invites SET used_at = ? WHERE id = ?"
  ).bind(now, invite.id).run();

  // Create session.
  const sessionToken = randomHex(32);
  const expiresAt = now + SESSION_MAX_AGE;
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionToken, user.id, expiresAt, now).run();
  await env.DB.prepare(
    "UPDATE users SET last_login_at = ? WHERE id = ?"
  ).bind(now, user.id).run();

  await logEvent(env, {
    type: "invite_accepted",
    detail: { email: user.email, role: user.role, agency_id: invite.agency_id },
    userId: user.id,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookie(sessionToken),
    },
  });
}

function invalidInviteResponse(): Response {
  const body = `
    <div style="max-width:400px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:12px"><em>Invite invalid</em></h1>
      <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
        This invite link has expired, has already been used, or doesn't exist.
        Ask whoever invited you to send a fresh one.
      </p>
      <a href="/login" class="btn">Go to sign in</a>
    </div>
  `;
  return html(layout("Invite invalid", body, null), 400);
}

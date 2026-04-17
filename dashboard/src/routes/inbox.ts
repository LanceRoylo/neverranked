/**
 * Dashboard -- Admin inbox
 *
 * GET  /admin/inbox
 * POST /admin/inbox/:source/:id/(approve|deny|dismiss)
 *
 * Unified queue of everything that genuinely needs human judgment.
 * Replaces the scattered-across-the-UI pattern of "click into each
 * section to approve pending things." Sources surfaced here:
 *
 *   - Agency applications awaiting admin approval
 *   - Competitor suggestions flagged for review by the sanity gate
 *   - Schema drafts that failed auto-approve validation
 *   - Unread admin_alerts (supports legacy alerts)
 *
 * Design principles:
 *   - Everything actionable is inline (Approve / Deny / Dismiss buttons right on the row)
 *   - Each source renders its own section with a count
 *   - Sources with zero pending items disappear entirely so the page stays quiet
 *   - Items are sorted oldest-first within a section (FIFO review)
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";

interface InboxAgencyApp {
  id: number;
  agency_name: string;
  contact_email: string;
  contact_name: string | null;
  website: string | null;
  estimated_clients: number | null;
  notes: string | null;
  created_at: number;
}

interface InboxCompetitorSuggestion {
  id: number;
  client_slug: string;
  domain: string;
  label: string | null;
  suggested_by_email: string;
  created_at: number;
}

interface InboxSchemaDraft {
  id: number;
  client_slug: string;
  schema_type: string;
  status: string;
  created_at: number;
}

interface InboxAdminAlert {
  id: number;
  client_slug: string;
  type: string;
  title: string;
  detail: string | null;
  created_at: number;
}

function ago(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export async function handleInbox(user: User, env: Env): Promise<Response> {
  // Pull every queued thing in parallel.
  const [apps, suggestions, drafts, alerts] = await Promise.all([
    env.DB.prepare(
      `SELECT id, agency_name, contact_email, contact_name, website, estimated_clients, notes, created_at
         FROM agency_applications
         WHERE status = 'pending'
         ORDER BY created_at ASC`
    ).all<InboxAgencyApp>().catch(() => ({ results: [] as InboxAgencyApp[] })),
    env.DB.prepare(
      `SELECT cs.id, cs.client_slug, cs.domain, cs.label, u.email AS suggested_by_email, cs.created_at
         FROM competitor_suggestions cs
         LEFT JOIN users u ON u.id = cs.suggested_by
         WHERE cs.status = 'pending'
         ORDER BY cs.created_at ASC`
    ).all<InboxCompetitorSuggestion>(),
    env.DB.prepare(
      `SELECT id, client_slug, schema_type, status, created_at
         FROM schema_injections
         WHERE status = 'draft'
         ORDER BY created_at ASC
         LIMIT 30`
    ).all<InboxSchemaDraft>(),
    env.DB.prepare(
      `SELECT id, client_slug, type, title, detail, created_at
         FROM admin_alerts
         WHERE read_at IS NULL
         ORDER BY created_at ASC
         LIMIT 100`
    ).all<InboxAdminAlert>(),
  ]);

  const appRows = apps.results || [];
  const sugRows = suggestions.results || [];
  const draftRows = drafts.results || [];
  const alertRows = alerts.results || [];
  const totalQueued = appRows.length + sugRows.length + draftRows.length + alertRows.length;

  // --- Section renderers ---

  const renderAgencyApps = () => {
    if (appRows.length === 0) return "";
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0;font-style:italic">Agency applications</h3>
          <span class="label" style="font-size:10px">${appRows.length} pending</span>
        </div>
        ${appRows.map(a => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
            <div style="min-width:0;flex:1">
              <div style="font-size:14px;font-weight:500">${esc(a.agency_name)}</div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:2px">
                ${esc(a.contact_email)}${a.contact_name ? " &middot; " + esc(a.contact_name) : ""}
                ${a.website ? ` &middot; <a href="${esc(a.website)}" target="_blank" style="color:var(--text-mute)">${esc(a.website)}</a>` : ""}
                ${a.estimated_clients ? ` &middot; ~${a.estimated_clients} clients` : ""}
                &middot; ${ago(a.created_at)} ago
              </div>
              ${a.notes ? `<div style="font-size:12px;color:var(--text-soft);margin-top:6px">${esc(a.notes)}</div>` : ""}
            </div>
            <div style="display:flex;gap:6px;white-space:nowrap">
              <form method="POST" action="/admin/inbox/agency-app/${a.id}/approve" style="margin:0"><button type="submit" class="btn" style="padding:6px 12px;font-size:10px">Approve</button></form>
              <form method="POST" action="/admin/inbox/agency-app/${a.id}/deny" style="margin:0"><button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:10px">Deny</button></form>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  const renderSuggestions = () => {
    if (sugRows.length === 0) return "";
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0;font-style:italic">Competitor suggestions</h3>
          <span class="label" style="font-size:10px">${sugRows.length} flagged</span>
        </div>
        ${sugRows.map(s => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
            <div style="min-width:0;flex:1">
              <div style="font-size:14px;font-weight:500">${esc(s.domain)}${s.label ? ` <span style="color:var(--text-faint)">(${esc(s.label)})</span>` : ""}</div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:2px">
                client: ${esc(s.client_slug)} &middot; suggested by ${esc(s.suggested_by_email || "system")} &middot; ${ago(s.created_at)} ago
              </div>
            </div>
            <div style="display:flex;gap:6px;white-space:nowrap">
              <form method="POST" action="/admin/inbox/suggestion/${s.id}/approve" style="margin:0"><button type="submit" class="btn" style="padding:6px 12px;font-size:10px">Approve &amp; track</button></form>
              <form method="POST" action="/admin/inbox/suggestion/${s.id}/deny" style="margin:0"><button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:10px">Deny</button></form>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  const renderSchemaDrafts = () => {
    if (draftRows.length === 0) return "";
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0;font-style:italic">Schema drafts</h3>
          <span class="label" style="font-size:10px">${draftRows.length} awaiting review</span>
        </div>
        <p style="font-size:12px;color:var(--text-faint);margin:0 0 10px">
          These drafts did not pass auto-approve (unknown schema type, validation error, rate limit, or automation paused). Review in the inject admin before shipping.
        </p>
        ${draftRows.map(d => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px"><strong>${esc(d.schema_type)}</strong> &middot; ${esc(d.client_slug)}</div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:2px">${ago(d.created_at)} ago</div>
            </div>
            <a href="/admin/inject/${esc(d.client_slug)}" class="btn btn-ghost" style="padding:6px 12px;font-size:10px">Open editor</a>
          </div>
        `).join("")}
      </div>
    `;
  };

  const renderAlerts = () => {
    if (alertRows.length === 0) return "";
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0;font-style:italic">Alerts</h3>
          <span class="label" style="font-size:10px">${alertRows.length} unread</span>
        </div>
        ${alertRows.map(a => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px">
                <span style="color:var(--gold);font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.14em">${esc(a.type)}</span>
                <span style="color:var(--text-faint);margin-left:4px">${esc(a.client_slug)}</span>
              </div>
              <div style="font-size:13px;margin-top:4px">${esc(a.title)}</div>
              ${a.detail ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text-soft);margin-top:4px">${esc(a.detail)}</div>` : ""}
              <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);margin-top:4px">${ago(a.created_at)} ago</div>
            </div>
            <div style="display:flex;gap:6px;white-space:nowrap">
              <form method="POST" action="/admin/inbox/alert/${a.id}/dismiss" style="margin:0"><button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:10px">Dismiss</button></form>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  const empty = totalQueued === 0 ? `
    <div class="empty" style="padding:64px 24px;text-align:center">
      <div style="font-family:var(--serif);font-size:24px;font-style:italic;margin-bottom:8px">Inbox zero</div>
      <p style="color:var(--text-soft)">Nothing needs your attention. The automation layer is handling the rest.</p>
    </div>
  ` : "";

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">
        <a href="/admin" style="color:var(--text-mute)">Cockpit</a> / Inbox
      </div>
      <h1>Inbox <em>${totalQueued}</em></h1>
      <p class="section-sub">Only things that genuinely need you. Everything else is handled by automation or lives in its own page.</p>
    </div>

    ${empty}
    ${renderAgencyApps()}
    ${renderSuggestions()}
    ${renderSchemaDrafts()}
    ${renderAlerts()}
  `;

  return html(layout("Inbox", body, user));
}

// ---------------------------------------------------------------------------
// Inline action handlers (approve / deny / dismiss)
// ---------------------------------------------------------------------------

export async function handleInboxAgencyAppAction(
  id: number,
  action: "approve" | "deny",
  user: User,
  env: Env,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const nextStatus = action === "approve" ? "approved" : "rejected";
  await env.DB.prepare(
    "UPDATE agency_applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(nextStatus, user.id, now, id).run().catch(() => {});
  return redirect("/admin/inbox");
}

export async function handleInboxSuggestionAction(
  id: number,
  action: "approve" | "deny",
  user: User,
  env: Env,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  if (action === "deny") {
    await env.DB.prepare(
      "UPDATE competitor_suggestions SET status = 'rejected' WHERE id = ?"
    ).bind(id).run();
    return redirect("/admin/inbox");
  }

  // Approve: flip suggestion to approved AND add to domains table
  // (the auto-add path does both in one step; we replicate here for
  // the manual-approve case).
  const suggestion = await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE id = ? AND status = 'pending'"
  ).bind(id).first<{ id: number; client_slug: string; domain: string; label: string | null }>();
  if (!suggestion) return redirect("/admin/inbox");

  const maxOrder = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) AS n FROM domains WHERE client_slug = ? AND is_competitor = 1"
  ).bind(suggestion.client_slug).first<{ n: number }>();
  const nextOrder = (maxOrder?.n || 0) + 1;

  await env.DB.prepare(
    "INSERT OR IGNORE INTO domains (client_slug, domain, is_competitor, competitor_label, active, sort_order, created_at, updated_at) VALUES (?, ?, 1, ?, 1, ?, ?, ?)"
  ).bind(suggestion.client_slug, suggestion.domain, suggestion.label, nextOrder, now, now).run();

  await env.DB.prepare(
    "UPDATE competitor_suggestions SET status = 'approved' WHERE id = ?"
  ).bind(id).run();

  return redirect("/admin/inbox");
}

export async function handleInboxAlertDismiss(
  id: number,
  user: User,
  env: Env,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE admin_alerts SET read_at = ? WHERE id = ? AND read_at IS NULL"
  ).bind(now, id).run();
  return redirect("/admin/inbox");
}

/**
 * Routes: /admin/inbox + /admin/inbox/<id> + action handlers.
 *
 * Admin-only. Lists pending items, detail page with the full body and
 * action buttons, and POST endpoints for approve / reject / snooze /
 * resolve. Producers (content drafts, tone-guard failures, etc.) write
 * rows; this is the consumer surface.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import {
  getPendingInbox,
  getResolvedInbox,
  getInboxItem,
  getInboxStats,
  resolveInboxItem,
  snoozeInboxItem,
} from "../admin-inbox";

function fmtAge(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function urgencyBadge(urgency: string): string {
  const colors: Record<string, string> = { high: "var(--red)", normal: "var(--text-mute)", low: "var(--text-faint)" };
  const color = colors[urgency] ?? "var(--text-mute)";
  return `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${color};border:1px solid ${color};padding:2px 6px;border-radius:2px">${esc(urgency)}</span>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    pending: "var(--yellow)", approved: "var(--green)", rejected: "var(--red)",
    snoozed: "var(--text-faint)", resolved: "var(--text-mute)",
  };
  const color = colors[status] ?? "var(--text-mute)";
  return `<span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${color};padding:2px 0">${esc(status)}</span>`;
}

export async function handleInboxList(user: User, env: Env, url: URL): Promise<Response> {
  const view = url.searchParams.get("view") ?? "pending";
  const items = view === "resolved"
    ? await getResolvedInbox(env, 100)
    : await getPendingInbox(env, 100);
  const stats = await getInboxStats(env);
  const now = Math.floor(Date.now() / 1000);

  const rows = items.length === 0
    ? `<div class="empty"><h3>Nothing here</h3><p style="color:var(--text-mute)">${view === "resolved" ? "No resolved items yet." : "Inbox zero. Nothing needs your attention right now."}</p></div>`
    : items.map((it) => {
        const age = fmtAge(now - it.created_at);
        const slug = it.target_slug ? `<span style="color:var(--text-mute);margin-left:8px">${esc(it.target_slug)}</span>` : "";
        return `
          <div style="border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                ${urgencyBadge(it.urgency)}
                <span style="color:var(--text-faint);font-size:12px">${age} old &middot; ${esc(it.kind)}</span>
              </div>
              <a href="/admin/inbox/${it.id}" style="color:var(--text);text-decoration:none;font-size:15px;font-weight:500">${esc(it.title)}</a>
              ${slug}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${statusBadge(it.status)}
              <a href="/admin/inbox/${it.id}" class="btn btn-ghost" style="padding:6px 12px;font-size:11px">Open</a>
            </div>
          </div>`;
      }).join("");

  const tabs = `
    <div style="display:flex;gap:16px;margin-bottom:24px;border-bottom:1px solid var(--line)">
      <a href="/admin/inbox?view=pending" style="padding:10px 0;border-bottom:2px solid ${view === "pending" ? "var(--text)" : "transparent"};color:${view === "pending" ? "var(--text)" : "var(--text-mute)"};text-decoration:none;font-size:13px">
        Pending (${stats.pending_total})
      </a>
      <a href="/admin/inbox?view=resolved" style="padding:10px 0;border-bottom:2px solid ${view === "resolved" ? "var(--text)" : "transparent"};color:${view === "resolved" ? "var(--text)" : "var(--text-mute)"};text-decoration:none;font-size:13px">
        Resolved
      </a>
    </div>
  `;

  const summary = stats.pending_high > 0
    ? `<div style="border:2px solid var(--red);border-radius:6px;padding:16px;margin-bottom:24px;background:rgba(232,84,84,0.05)"><strong style="color:var(--red)">${stats.pending_high} HIGH-urgency item${stats.pending_high === 1 ? "" : "s"}</strong> in your inbox. Address these first.</div>`
    : "";

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Admin</a> / Inbox</div>
      <h1>Admin <em>inbox</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px">Everything that needs your decision lands here. Daily summary at 7am Pacific. High-urgency items also fire an immediate email.</p>
    </div>
    ${summary}
    ${tabs}
    ${rows}
  `;

  return html(layout("Inbox", body, user));
}

export async function handleInboxDetail(id: number, user: User, env: Env): Promise<Response> {
  const item = await getInboxItem(env, id);
  if (!item) {
    return html(layout("Not found", `<div class="empty"><h3>Inbox item not found</h3></div>`, user), 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const age = fmtAge(now - item.created_at);
  const isPending = item.status === "pending" || item.status === "snoozed";

  const actionForm = isPending ? `
    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-top:24px">
      <div class="label" style="margin-bottom:12px">Resolve</div>
      <form method="POST" action="/admin/inbox/${item.id}/approve" style="display:inline-block;margin-right:8px">
        <button type="submit" class="btn" style="padding:8px 16px;font-size:12px">Approve</button>
      </form>
      <form method="POST" action="/admin/inbox/${item.id}/reject" style="display:inline-block;margin-right:8px">
        <button type="submit" class="btn btn-ghost" style="padding:8px 16px;font-size:12px">Reject</button>
      </form>
      <form method="POST" action="/admin/inbox/${item.id}/resolve" style="display:inline-block;margin-right:8px">
        <button type="submit" class="btn btn-ghost" style="padding:8px 16px;font-size:12px">Mark resolved</button>
      </form>
      <form method="POST" action="/admin/inbox/${item.id}/snooze" style="display:inline-block">
        <input type="number" name="days" value="1" min="1" max="30" style="width:60px;padding:6px 8px;background:var(--bg-lift);color:var(--text);border:1px solid var(--line);border-radius:3px;font-family:var(--mono);font-size:12px">
        <button type="submit" class="btn btn-ghost" style="padding:8px 16px;font-size:12px">Snooze N days</button>
      </form>
    </div>
  ` : `
    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-top:24px;color:var(--text-mute);font-size:13px">
      Resolved ${item.resolved_at ? new Date(item.resolved_at * 1000).toLocaleString() : ""} as <strong>${esc(item.status)}</strong>${item.resolution_note ? ` &middot; "${esc(item.resolution_note)}"` : ""}.
    </div>
  `;

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Admin</a> / <a href="/admin/inbox" style="color:var(--text-mute)">Inbox</a> / Item</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
        ${urgencyBadge(item.urgency)}
        ${statusBadge(item.status)}
        <span style="color:var(--text-faint);font-size:12px">${age} old &middot; ${esc(item.kind)}${item.target_slug ? " &middot; " + esc(item.target_slug) : ""}</span>
      </div>
      <h1 style="margin-top:12px">${esc(item.title)}</h1>
    </div>

    ${item.body ? `<div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-bottom:16px;white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text-soft)">${esc(item.body)}</div>` : ""}

    ${item.action_url ? `<a href="${esc(item.action_url)}" class="btn" style="padding:10px 20px;font-size:13px;text-decoration:none">Open the thing &rarr;</a>` : ""}

    ${actionForm}
  `;

  return html(layout("Inbox item", body, user));
}

export async function handleInboxAction(
  id: number,
  action: "approve" | "reject" | "resolve" | "snooze",
  user: User,
  env: Env,
  request: Request,
): Promise<Response> {
  if (action === "snooze") {
    const form = await request.formData();
    const days = parseInt(String(form.get("days") ?? "1"), 10);
    await snoozeInboxItem(env, id, isFinite(days) ? days : 1, user.id);
  } else {
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "resolved";
    await resolveInboxItem(env, id, status, user.id);
  }
  return redirect("/admin/inbox");
}

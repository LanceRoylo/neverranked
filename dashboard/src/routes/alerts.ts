/**
 * Dashboard -- Client alerts page
 *
 * Shows all alerts for the current user's client, lets them
 * mark individual alerts as read, or mark all as read.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";

interface Alert {
  id: number;
  client_slug: string;
  type: string;
  title: string;
  detail: string | null;
  roadmap_item_id: number | null;
  read_at: number | null;
  created_at: number;
}

function alertIcon(type: string): { icon: string; color: string } {
  switch (type) {
    case "milestone": return { icon: "^^", color: "var(--gold)" };
    case "regression":
    case "score_change": return { icon: "vv", color: "var(--red)" };
    case "auto_completed": return { icon: "ok", color: "var(--green)" };
    case "needs_review": return { icon: "??", color: "var(--yellow)" };
    default: return { icon: "--", color: "var(--text-faint)" };
  }
}

function alertTypeLabel(type: string): string {
  switch (type) {
    case "milestone": return "Milestone";
    case "regression": return "Score Drop";
    case "score_change": return "Score Change";
    case "auto_completed": return "Auto-Completed";
    case "needs_review": return "Needs Review";
    default: return type;
  }
}

export async function handleAlerts(user: User, env: Env): Promise<Response> {
  const clientSlug = user.role === "admin" ? null : user.client_slug;

  let alerts: Alert[];
  if (clientSlug) {
    alerts = (await env.DB.prepare(
      "SELECT * FROM admin_alerts WHERE client_slug = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(clientSlug).all<Alert>()).results;
  } else {
    alerts = (await env.DB.prepare(
      "SELECT * FROM admin_alerts ORDER BY created_at DESC LIMIT 100"
    ).all<Alert>()).results;
  }

  const unreadCount = alerts.filter(a => !a.read_at).length;

  const alertRows = alerts.length > 0 ? alerts.map(a => {
    const { icon, color } = alertIcon(a.type);
    const isRead = !!a.read_at;
    const date = new Date(a.created_at * 1000);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const opacity = isRead ? "opacity:.55" : "";

    return `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(251,248,239,.06);${opacity}">
        <div style="flex-shrink:0;width:32px;height:32px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:500;color:${color}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:14px;color:var(--text);${isRead ? '' : 'font-weight:400'}">${esc(a.title)}</span>
            ${!isRead ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);flex-shrink:0"></span>' : ''}
          </div>
          ${a.detail ? `<div style="font-size:12px;color:var(--text-faint);line-height:1.5;margin-bottom:6px">${esc(a.detail)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-faint)">
            <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:9px;color:${color};border:1px solid ${color};padding:1px 6px;border-radius:2px">${alertTypeLabel(a.type)}</span>
            ${user.role === "admin" ? `<span>${esc(a.client_slug)}</span>` : ''}
            <span>${dateStr} at ${timeStr}</span>
          </div>
        </div>
        <div style="flex-shrink:0;display:flex;gap:8px;align-items:center">
          ${a.roadmap_item_id ? `<a href="/roadmap/${encodeURIComponent(a.client_slug)}" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border:1px solid var(--line);padding:4px 10px;border-radius:2px;text-decoration:none;transition:color .2s,border-color .2s" onmouseover="this.style.color='var(--gold)';this.style.borderColor='var(--gold)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'">Roadmap</a>` : ''}
          ${!isRead ? `
            <form method="POST" action="/alerts/read/${a.id}" style="display:inline">
              <button type="submit" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);background:none;border:1px solid var(--line);padding:4px 10px;border-radius:2px;cursor:pointer;transition:color .2s,border-color .2s" onmouseover="this.style.color='var(--green)';this.style.borderColor='var(--green)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'">Mark read</button>
            </form>
          ` : ''}
        </div>
      </div>
    `;
  }).join("") : "";

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">Dashboard</div>
        <h1>Your <em>alerts</em></h1>
      </div>
      ${unreadCount > 0 ? `
        <form method="POST" action="/alerts/read-all">
          <button type="submit" class="btn btn-ghost" style="font-size:11px">Mark all as read</button>
        </form>
      ` : ''}
    </div>

    ${unreadCount > 0 ? `
      <div style="margin-bottom:24px;font-size:13px;color:var(--text-soft)">
        ${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}
      </div>
    ` : ''}

    ${alerts.length > 0 ? `
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;overflow:hidden">
        ${alertRows}
      </div>
    ` : `
      <div class="empty">
        <h3>No alerts</h3>
        <p style="color:var(--text-faint);font-size:14px;line-height:1.7;max-width:440px;margin:0 auto">When something changes with your AEO score, schema coverage, or roadmap progress, it will show up here.</p>
      </div>
    `}
  `;

  return html(layout("Alerts", body, user));
}

export async function handleMarkAlertRead(alertId: number, user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  if (user.role === "admin") {
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ?").bind(now, alertId).run();
  } else if (user.client_slug) {
    // Client can only mark their own alerts
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ? AND client_slug = ?").bind(now, alertId, user.client_slug).run();
  }

  return redirect("/alerts");
}

export async function handleMarkAllAlertsRead(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  if (user.role === "admin") {
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE read_at IS NULL").bind(now).run();
  } else if (user.client_slug) {
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE client_slug = ? AND read_at IS NULL").bind(now, user.client_slug).run();
  }

  return redirect("/alerts");
}

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

/**
 * Map an alert to the page where the user takes action on it.
 * The title becomes a click-through to this URL so Lance never has
 * to hunt for the right surface after seeing an alert. Falls back
 * to the domain detail page (for client roles) or the cockpit
 * (for admins) when no specific action page applies.
 */
function alertActionUrl(a: Alert, isAdmin: boolean): string | null {
  const slug = a.client_slug;

  // FAQ / breadcrumb / article draft awaiting human review.
  // The 'draft_ready' alert is written by the schema generators
  // when a content draft lands in 'pending' status.
  if (a.type === "draft_ready") {
    return isAdmin ? `/admin/inject/${slug}` : `/citations/${slug}`;
  }

  // Schema deploy alerts (e.g. "Deployed FAQPage", "Event refresh: N
  // added"). Take the user to the inject admin page where deployed
  // schemas live and can be paused/edited.
  if (a.type === "deploy") {
    return isAdmin ? `/admin/inject/${slug}` : `/domain-by-slug/${slug}`;
  }

  // First-citation milestones, score upgrades, score-band crossings.
  // Take the user to the citation dashboard or domain detail.
  if (a.type === "milestone" || a.type === "first_citation") {
    if (a.title?.toLowerCase().includes("citation")) {
      return `/citations/${slug}`;
    }
    if (a.title?.toLowerCase().includes("roadmap")) {
      return `/roadmap/${slug}`;
    }
    return `/citations/${slug}`;
  }

  // Score regressions or changes: domain detail page so the user
  // sees what changed in the latest scan.
  if (a.type === "regression" || a.type === "score_change") {
    return `/citations/${slug}`;
  }

  // Auto-completed roadmap items: the roadmap page.
  if (a.type === "auto_completed") {
    return `/roadmap/${slug}`;
  }

  // Snippet detected on a client site.
  if (a.type === "snippet_detected") {
    return isAdmin ? `/admin/inject/${slug}` : `/citations/${slug}`;
  }

  // Cron-activated, draft_ready, fetch-failed, parser-drift -- send
  // admin to the relevant inject page.
  if (a.type === "cron_activated"
      || a.type === "htc_events_fetch_failed"
      || a.type === "htc_events_parser_drift"
      || a.type === "config_lazy_created"
      || a.type === "config_drift_missing") {
    return isAdmin ? `/admin/inject/${slug}` : null;
  }

  // Generic needs_review: send to inbox where it's likely surfaced
  if (a.type === "needs_review") {
    return isAdmin ? "/admin/inbox" : null;
  }

  // Unknown type -- fall back to the citation page (for clients)
  // or the cockpit (for admins) so we never leave the user stranded.
  return slug ? `/citations/${slug}` : (isAdmin ? "/admin" : null);
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

  const isAdmin = user.role === "admin";
  const alertRows = alerts.length > 0 ? alerts.map(a => {
    const { icon, color } = alertIcon(a.type);
    const isRead = !!a.read_at;
    const date = new Date(a.created_at * 1000);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const opacity = isRead ? "opacity:.55" : "";
    const actionUrl = alertActionUrl(a, isAdmin);
    // Title is a link to the action page. Routed through
    // /alerts/click/:id which marks the alert read in one
    // pass and then redirects -- no manual "Mark read" click
    // required after click-through. Falls back to inert text
    // when no action URL exists for the alert type.
    const clickThroughUrl = actionUrl
      ? `/alerts/click/${a.id}?next=${encodeURIComponent(actionUrl)}`
      : null;
    const titleHtml = clickThroughUrl
      ? `<a href="${clickThroughUrl}" style="font-size:14px;color:var(--text);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s" onmouseover="this.style.borderBottomColor='var(--gold)'" onmouseout="this.style.borderBottomColor='transparent'">${esc(a.title)}</a>`
      : `<span style="font-size:14px;color:var(--text)">${esc(a.title)}</span>`;

    return `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(251,248,239,.06);${opacity}">
        <div style="flex-shrink:0;width:32px;height:32px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:500;color:${color}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            ${titleHtml}
            ${!isRead ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);flex-shrink:0"></span>' : ''}
          </div>
          ${a.detail ? `<div style="font-size:12px;color:var(--text-faint);line-height:1.5;margin-bottom:6px">${esc(a.detail)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-faint)">
            <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:9px;color:${color};border:1px solid ${color};padding:1px 6px;border-radius:2px">${alertTypeLabel(a.type)}</span>
            ${user.role === "admin" && !user._viewAsClient ? `<span>${esc(a.client_slug)}</span>` : ''}
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

/**
 * Click-through: marks the alert read AND redirects to its action
 * page in one request. Removes the "see alert -> click title ->
 * separately click Mark read" friction. The next= query param is
 * URL-encoded and validated to start with / so we don't get used
 * as an open redirect.
 */
export async function handleAlertClickThrough(alertId: number, user: User, env: Env, url: URL): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  if (user.role === "admin") {
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ? AND read_at IS NULL").bind(now, alertId).run();
  } else if (user.client_slug) {
    await env.DB.prepare("UPDATE admin_alerts SET read_at = ? WHERE id = ? AND client_slug = ? AND read_at IS NULL").bind(now, alertId, user.client_slug).run();
  }
  const next = url.searchParams.get("next") || "/alerts";
  // Open-redirect guard: only allow same-origin paths
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/alerts";
  return redirect(safeNext);
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

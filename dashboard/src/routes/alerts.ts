/**
 * Dashboard -- alerts page (two lanes)
 *
 * Needs you  = UNREAD concerns (a human must act), worst severity first,
 *              each with a fix affordance (resolve in-app, or copy a fix
 *              request for Claude).
 * Activity   = routine + good-news + anything already read. A feed, not an
 *              alarm. Kept out of the count so the badge stays honest.
 *
 * Lane + severity come from classifyAlert() in lib/alert-triage.ts.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { isCustomerVisibleAlert } from "../admin-alerts";
import { classifyAlert, isConcernType, severityRank, type AlertSeverity } from "../lib/alert-triage";

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
  const isAdmin = user.role === "admin";

  let alerts: Alert[];
  if (clientSlug) {
    // Customer view: gate out internal ops types first (leak fix 2026-06-01).
    alerts = (await env.DB.prepare(
      "SELECT * FROM admin_alerts WHERE client_slug = ? ORDER BY created_at DESC LIMIT 200"
    ).bind(clientSlug).all<Alert>())
      .results.filter((a) => isCustomerVisibleAlert(a.type)).slice(0, 80);
  } else {
    alerts = (await env.DB.prepare(
      "SELECT * FROM admin_alerts ORDER BY created_at DESC LIMIT 150"
    ).all<Alert>()).results;
  }

  // Triage into lanes. Needs-you = UNREAD concerns (worst severity first, then
  // newest). Activity = routine types plus anything already read.
  const triaged = alerts.map((a) => ({ a, t: classifyAlert(a.type) }));
  const needsYou = triaged
    .filter((x) => !x.a.read_at && x.t.lane === "needs_you")
    .sort((p, q) => severityRank(p.t.severity) - severityRank(q.t.severity) || q.a.created_at - p.a.created_at);
  const activity = triaged.filter((x) => !(!x.a.read_at && x.t.lane === "needs_you"));
  const unreadActivity = activity.filter((x) => !x.a.read_at).length;

  const sevColor = (s: AlertSeverity) => s === "high" ? "var(--red,#e07158)" : s === "medium" ? "var(--gold,#e8c767)" : "var(--text-faint)";
  const dateStr = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };
  const titleLink = (a: Alert) => {
    const url = alertActionUrl(a, isAdmin);
    const ct = url ? `/alerts/click/${a.id}?next=${encodeURIComponent(url)}` : null;
    return ct
      ? `<a href="${ct}" style="font-size:14px;color:var(--text);text-decoration:none;border-bottom:1px solid transparent" onmouseover="this.style.borderBottomColor='var(--gold)'" onmouseout="this.style.borderBottomColor='transparent'">${esc(a.title)}</a>`
      : `<span style="font-size:14px;color:var(--text)">${esc(a.title)}</span>`;
  };
  const clientTag = (a: Alert) => (user.role === "admin" && !user._viewAsClient && a.client_slug) ? `<span>${esc(a.client_slug)}</span>` : "";
  const markReadBtn = (a: Alert) => `
    <form method="POST" action="/alerts/read/${a.id}" style="display:inline">
      <button type="submit" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);background:none;border:1px solid var(--line);padding:4px 10px;border-radius:2px;cursor:pointer">Mark read</button>
    </form>`;

  // Needs-you row: severity pill, the concern, and a fix affordance.
  const needsYouRow = ({ a, t }: { a: Alert; t: ReturnType<typeof classifyAlert> }) => {
    const c = sevColor(t.severity);
    const fixReq = `In the NeverRanked dashboard, an alert needs attention.\n[${a.type}]${a.client_slug ? " (" + a.client_slug + ")" : ""} ${a.title}\n${a.detail ? "Detail: " + a.detail + "\n" : ""}Suggested fix: ${t.fixHint}\nInvestigate and resolve it, then confirm the underlying condition cleared.`;
    return `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(251,248,239,.06);border-left:3px solid ${c}">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;flex-wrap:wrap">
            <span style="font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${c};border:1px solid ${c};padding:1px 6px;border-radius:2px">${t.severity}</span>
            ${titleLink(a)}
          </div>
          ${a.detail ? `<div style="font-size:12px;color:var(--text-faint);line-height:1.5;margin-bottom:8px">${esc(a.detail)}</div>` : ""}
          <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-faint);flex-wrap:wrap">
            <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:9px">${esc(alertTypeLabel(a.type))}</span>
            ${clientTag(a)}
            <span>${dateStr(a.created_at)}</span>
          </div>
        </div>
        <div style="flex-shrink:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${a.roadmap_item_id ? `<a href="/roadmap/${encodeURIComponent(a.client_slug)}" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border:1px solid var(--line);padding:4px 10px;border-radius:2px;text-decoration:none">Resolve</a>` : ""}
          <button type="button" class="alert-fix" data-fix="${esc(fixReq)}" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);background:none;border:1px solid var(--gold);padding:4px 10px;border-radius:2px;cursor:pointer">Copy fix request</button>
          ${markReadBtn(a)}
        </div>
      </div>`;
  };

  // Activity row: the lighter feed. No severity, no fix button.
  const activityRow = ({ a }: { a: Alert; t: ReturnType<typeof classifyAlert> }) => {
    const { icon, color } = alertIcon(a.type);
    const isRead = !!a.read_at;
    return `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:13px 20px;border-bottom:1px solid rgba(251,248,239,.05);${isRead ? "opacity:.5" : ""}">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;color:${color}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="margin-bottom:3px">${titleLink(a)}${!isRead ? ' <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold)"></span>' : ""}</div>
          ${a.detail ? `<div style="font-size:12px;color:var(--text-faint);line-height:1.5;margin-bottom:4px">${esc(a.detail)}</div>` : ""}
          <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-faint);flex-wrap:wrap">
            <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:9px;color:${color}">${esc(alertTypeLabel(a.type))}</span>
            ${clientTag(a)}
            <span>${dateStr(a.created_at)}</span>
          </div>
        </div>
        ${!isRead ? `<div style="flex-shrink:0">${markReadBtn(a)}</div>` : ""}
      </div>`;
  };

  const needsYouHtml = needsYou.length > 0
    ? `<div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;overflow:hidden">${needsYou.map(needsYouRow).join("")}</div>`
    : `<div style="padding:22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;color:var(--text-faint);font-size:14px">Nothing needs you right now. All clear.</div>`;

  const activityHtml = activity.length > 0
    ? `<div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;overflow:hidden">${activity.slice(0, 60).map(activityRow).join("")}</div>`
    : `<div style="padding:18px;color:var(--text-faint);font-size:13px">No recent activity.</div>`;

  const body = `
    <div style="margin-bottom:28px">
      <div class="label" style="margin-bottom:8px">Dashboard</div>
      <h1>Your <em>alerts</em></h1>
    </div>

    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
      <h2 style="font-weight:400;margin:0">Needs you</h2>
      <span style="font-family:var(--mono);font-size:13px;color:${needsYou.length > 0 ? "var(--gold)" : "var(--text-faint)"}">${needsYou.length}</span>
    </div>
    ${needsYouHtml}

    <div style="display:flex;align-items:baseline;gap:12px;margin:34px 0 14px">
      <h2 style="font-weight:400;margin:0">Activity</h2>
      <span style="font-size:11px;color:var(--text-faint)">good news and routine, no action needed</span>
      ${unreadActivity > 0 ? `<form method="POST" action="/alerts/read-activity" style="margin-left:auto"><button type="submit" class="btn btn-ghost" style="font-size:11px">Mark activity read</button></form>` : ""}
    </div>
    ${activityHtml}

    <script>
      (function(){
        document.querySelectorAll('.alert-fix').forEach(function(btn){
          btn.addEventListener('click', function(){
            if (navigator.clipboard) navigator.clipboard.writeText(btn.getAttribute('data-fix') || '');
            var old = btn.textContent; btn.textContent = 'Copied';
            setTimeout(function(){ btn.textContent = old; }, 1500);
          });
        });
      })();
    </script>
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

/**
 * Mark ONLY the Activity lane (routine / good-news, non-concern) read. The
 * two-lane design must never let a bulk dismiss wipe concerns, so this clears
 * the noise feed and leaves every Needs-you item for individual attention.
 */
export async function handleMarkActivityRead(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  let rows: { id: number; type: string }[] = [];
  if (user.role === "admin") {
    rows = (await env.DB.prepare("SELECT id, type FROM admin_alerts WHERE read_at IS NULL").all<{ id: number; type: string }>()).results
      .filter((r) => !isConcernType(r.type));
  } else if (user.client_slug) {
    rows = (await env.DB.prepare("SELECT id, type FROM admin_alerts WHERE client_slug = ? AND read_at IS NULL").bind(user.client_slug).all<{ id: number; type: string }>()).results
      .filter((r) => isCustomerVisibleAlert(r.type) && !isConcernType(r.type));
  }
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ph = chunk.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE admin_alerts SET read_at = ? WHERE id IN (${ph})`).bind(now, ...chunk).run();
  }
  return redirect("/alerts");
}

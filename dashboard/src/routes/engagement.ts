/**
 * Dashboard -- Client Engagement Monitor (admin only)
 *
 * Login frequency, feature adoption, churn risk scoring.
 * Uses page_views table + user data to surface at-risk clients.
 *
 * GET /admin/engagement
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

interface ClientEngagement {
  client_slug: string;
  email: string;
  name: string | null;
  plan: string | null;
  last_login_at: number | null;
  created_at: number;
  total_views: number;
  views_7d: number;
  views_30d: number;
  unique_pages: number;
  last_view: number | null;
}

export async function handleEngagement(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const thirtyDaysAgo = now - 30 * 86400;

  // Get all client users with their engagement data
  const clients = (await env.DB.prepare(`
    SELECT
      u.client_slug,
      u.email,
      u.name,
      u.plan,
      u.last_login_at,
      u.created_at,
      COALESCE(pv_total.cnt, 0) as total_views,
      COALESCE(pv_7d.cnt, 0) as views_7d,
      COALESCE(pv_30d.cnt, 0) as views_30d,
      COALESCE(pv_pages.cnt, 0) as unique_pages,
      pv_latest.latest as last_view
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt FROM page_views GROUP BY user_id
    ) pv_total ON pv_total.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt FROM page_views WHERE created_at > ?1 GROUP BY user_id
    ) pv_7d ON pv_7d.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt FROM page_views WHERE created_at > ?2 GROUP BY user_id
    ) pv_30d ON pv_30d.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT path) as cnt FROM page_views WHERE created_at > ?2 GROUP BY user_id
    ) pv_pages ON pv_pages.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MAX(created_at) as latest FROM page_views GROUP BY user_id
    ) pv_latest ON pv_latest.user_id = u.id
    WHERE u.role = 'client' AND u.plan IS NOT NULL AND u.plan != 'none'
    ORDER BY pv_7d.cnt ASC NULLS FIRST
  `).bind(sevenDaysAgo, thirtyDaysAgo).all<ClientEngagement>()).results;

  // Feature adoption: which pages are used most (last 30 days)
  const featureUsage = (await env.DB.prepare(`
    SELECT path, COUNT(*) as hits, COUNT(DISTINCT user_id) as users
    FROM page_views
    WHERE created_at > ?
    GROUP BY path
    ORDER BY hits DESC
    LIMIT 20
  `).bind(thirtyDaysAgo).all<{ path: string; hits: number; users: number }>()).results;

  // Churn risk calculation
  const atRisk = clients.filter(c => {
    const daysSinceView = c.last_view ? (now - c.last_view) / 86400 : 999;
    return daysSinceView > 14 || c.views_30d < 3;
  });

  const activeClients = clients.filter(c => c.views_7d > 0);
  const totalClients = clients.length;

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/admin" style="color:var(--text-mute)">Cockpit</a>
      </div>
      <h1>Client <em>Engagement</em></h1>
      <p style="color:var(--text-faint);font-size:13px;margin-top:8px">
        Login activity, feature adoption, and churn risk across paying clients.
      </p>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1px solid var(--line);background:var(--bg-edge);margin-bottom:32px">
      ${statCell("Paying Clients", String(totalClients))}
      ${statCell("Active (7d)", String(activeClients.length), activeClients.length === totalClients ? "var(--ok)" : "")}
      ${statCell("At Risk", String(atRisk.length), atRisk.length > 0 ? "var(--danger)" : "var(--ok)")}
      ${statCell("Avg Views/30d", totalClients > 0 ? (clients.reduce((sum, c) => sum + c.views_30d, 0) / totalClients).toFixed(1) : "0")}
      ${statCell("Adoption Rate", totalClients > 0 ? Math.round(activeClients.length / totalClients * 100) + "%" : "0%")}
    </div>

    <!-- At-risk clients -->
    ${atRisk.length > 0 ? `
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px"><em style="color:var(--danger)">Churn risk</em></h2>
      <p style="font-size:12px;color:var(--text-faint);margin:0 0 14px">Clients with fewer than 3 page views in 30 days or no activity in 14+ days.</p>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              ${th("Client")}${th("Email")}${th("Plan")}${th("Last Active")}${th("Views (30d)", true)}${th("Risk")}
            </tr>
          </thead>
          <tbody>
            ${atRisk.map(c => riskRow(c, now)).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : `
    <div style="margin-bottom:32px;padding:20px;background:rgba(127,201,154,.06);border:1px solid var(--ok);border-radius:4px;font-size:13px;color:var(--ok)">
      No clients at churn risk. All paying clients are active.
    </div>
    `}

    <!-- All clients engagement -->
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px">All <em>clients</em></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              ${th("Client")}${th("Email")}${th("Plan")}${th("Last Active")}${th("7d Views", true)}${th("30d Views", true)}${th("Pages Used", true)}${th("Total", true)}
            </tr>
          </thead>
          <tbody>
            ${clients.length > 0 ? clients.map(c => clientRow(c, now)).join("") : '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text-faint)">No paying clients yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Feature adoption -->
    ${featureUsage.length > 0 ? `
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px">Feature <em>adoption</em> (30d)</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              ${th("Page / Feature")}${th("Hits", true)}${th("Unique Users", true)}${th("Bar")}
            </tr>
          </thead>
          <tbody>
            ${featureUsage.map(f => featureRow(f, featureUsage[0]?.hits || 1)).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : ""}
  `;

  return html(layout("Engagement", body, user), 200);
}

// ---------- Helpers ----------

function statCell(label: string, value: string, color?: string): string {
  return `
    <div style="padding:16px 14px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:4px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">${label}</div>
      <div style="font-family:var(--serif);font-size:26px${color ? `;color:${color}` : ''}">${value}</div>
    </div>`;
}

function th(label: string, rightAlign = false): string {
  return `<th style="text-align:${rightAlign ? 'right' : 'left'};padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">${label}</th>`;
}

function riskRow(c: ClientEngagement, now: number): string {
  const lastActive = c.last_view ? timeAgo(c.last_view, now) : "Never";
  const daysSince = c.last_view ? Math.floor((now - c.last_view) / 86400) : 999;
  const riskLevel = daysSince > 30 ? "High" : daysSince > 14 ? "Medium" : "Low";
  const riskColor = riskLevel === "High" ? "var(--danger)" : riskLevel === "Medium" ? "#e8a74e" : "var(--text-mute)";

  return `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:10px 14px;color:var(--text)">${esc(c.client_slug || "—")}</td>
      <td style="padding:10px 14px;color:var(--text-mute)">${esc(c.email)}</td>
      <td style="padding:10px 14px"><span style="color:var(--gold);font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-family:var(--label)">${esc(planLabel(c.plan))}</span></td>
      <td style="padding:10px 14px;color:var(--text-faint)">${lastActive}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${c.views_30d}</td>
      <td style="padding:10px 14px;color:${riskColor};font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase">${riskLevel}</td>
    </tr>`;
}

function clientRow(c: ClientEngagement, now: number): string {
  const lastActive = c.last_view ? timeAgo(c.last_view, now) : "Never";
  const daysSince = c.last_view ? Math.floor((now - c.last_view) / 86400) : 999;
  const activeColor = daysSince < 7 ? "var(--ok)" : daysSince < 14 ? "var(--text-mute)" : "var(--danger)";

  return `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:10px 14px;color:var(--text)">${esc(c.client_slug || "—")}</td>
      <td style="padding:10px 14px;color:var(--text-mute)">${esc(c.email)}</td>
      <td style="padding:10px 14px"><span style="color:var(--gold);font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-family:var(--label)">${esc(planLabel(c.plan))}</span></td>
      <td style="padding:10px 14px;color:${activeColor}">${lastActive}</td>
      <td style="padding:10px 14px;text-align:right;${c.views_7d > 0 ? 'color:var(--ok)' : 'color:var(--text-faint)'}">${c.views_7d}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${c.views_30d}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${c.unique_pages}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-faint)">${c.total_views}</td>
    </tr>`;
}

function featureRow(f: { path: string; hits: number; users: number }, maxHits: number): string {
  const pct = Math.round((f.hits / maxHits) * 100);
  const label = featureLabel(f.path);

  return `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:10px 14px;color:var(--text)">${esc(label)}<div style="font-size:10px;color:var(--text-faint)">${esc(f.path)}</div></td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${f.hits}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${f.users}</td>
      <td style="padding:10px 14px;min-width:120px">
        <div style="width:100%;height:6px;background:var(--line);border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:3px"></div>
        </div>
      </td>
    </tr>`;
}

function featureLabel(path: string): string {
  if (path === "/" || path === "") return "Dashboard Home";
  if (path.startsWith("/domain/")) return "Domain Detail";
  if (path.startsWith("/roadmap/")) return "Roadmap";
  if (path.startsWith("/competitors/")) return "Competitors";
  if (path.startsWith("/citations/")) return "Citations";
  if (path.startsWith("/search/")) return "Search Console";
  if (path.startsWith("/summary/")) return "Summary";
  if (path.startsWith("/report/")) return "Reports";
  if (path === "/settings") return "Settings";
  if (path === "/support") return "Support";
  if (path === "/alerts") return "Alerts";
  if (path === "/learn") return "Learn";
  if (path.startsWith("/learn/")) return "Learn Article";
  if (path === "/onboarding") return "Onboarding";
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/checkout/")) return "Checkout";
  return path;
}

function planLabel(plan: string | null): string {
  if (!plan || plan === "none") return "Free";
  const labels: Record<string, string> = { audit: "Audit", signal: "Signal", amplify: "Amplify" };
  return labels[plan] || plan;
}

function timeAgo(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  const days = Math.floor(diff / 86400);
  if (days === 1) return "1 day ago";
  if (days < 30) return days + " days ago";
  return Math.floor(days / 30) + " months ago";
}

/**
 * Dashboard -- Admin email delivery log viewer
 *
 * Routes:
 *   GET /admin/email-log           -> recent sends across all types
 *   GET /admin/email-log?status=failed   -> filter to failures
 *   GET /admin/email-log?email=foo  -> filter to a recipient
 *
 * Closes the visibility gap that bit us debugging the magic-link
 * delivery issue: previously, the only way to see whether a given
 * email actually went out was wrangler tail. Now it's one query
 * away in the admin UI.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

interface LogRow {
  id: number;
  email: string;
  type: string;
  status: string;
  status_code: number | null;
  error_message: string | null;
  agency_id: number | null;
  target_id: number | null;
  created_at: number;
}

const TYPE_LABELS: Record<string, string> = {
  magic_link: "Magic link",
  digest: "Weekly digest",
  regression: "Regression alert",
  invite: "Agency invite",
  snippet_delivery: "Snippet delivery",
  snippet_nudge_day7: "Snippet nudge (7d)",
  snippet_nudge_day14: "Snippet nudge (14d)",
  snippet_drift: "Snippet drift",
  roadmap_stall: "Roadmap stall",
  agency_onboarding: "Agency onboarding",
};

function relativeTime(now: number, ts: number): string {
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function handleAdminEmailLogGet(user: User | null, env: Env, url: URL): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const status = url.searchParams.get("status") || "";
  const emailFilter = (url.searchParams.get("email") || "").trim().toLowerCase();
  const typeFilter = url.searchParams.get("type") || "";

  // Build query dynamically. All filters are optional.
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (status === "failed") where.push("status = 'failed'");
  else if (status === "queued") where.push("status = 'queued'");
  if (emailFilter) {
    where.push("email LIKE ?");
    binds.push(`%${emailFilter}%`);
  }
  if (typeFilter) {
    where.push("type = ?");
    binds.push(typeFilter);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = (await env.DB.prepare(
    `SELECT * FROM email_delivery_log ${whereSql} ORDER BY id DESC LIMIT 100`
  ).bind(...binds).all<LogRow>()).results;

  // Stats: failure count last 24h.
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const stats = await env.DB.prepare(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM email_delivery_log WHERE created_at > ?`
  ).bind(dayAgo).first<{ total: number; failed: number }>();

  const now = Math.floor(Date.now() / 1000);

  const typeOptions = Object.keys(TYPE_LABELS).map(t =>
    `<option value="${t}"${typeFilter === t ? " selected" : ""}>${esc(TYPE_LABELS[t])}</option>`
  ).join("");

  const tableRows = rows.length === 0
    ? `<tr><td colspan="5" class="muted" style="padding:24px;text-align:center">No matching log entries.</td></tr>`
    : rows.map(r => {
        const statusBadge = r.status === "failed"
          ? `<span style="color:var(--red);font-weight:600">failed</span>`
          : `<span style="color:var(--green)">queued</span>`;
        const codeNote = r.status_code ? ` <span class="muted" style="font-size:11px">(${r.status_code})</span>` : "";
        const errCell = r.error_message
          ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);max-width:280px;white-space:normal;word-break:break-word">${esc(r.error_message)}</div>`
          : "";
        return `
          <tr>
            <td class="muted" style="white-space:nowrap;font-size:12px">${esc(relativeTime(now, r.created_at))}</td>
            <td style="font-size:13px">${esc(r.email)}</td>
            <td>${esc(TYPE_LABELS[r.type] || r.type)}</td>
            <td>${statusBadge}${codeNote}${errCell}</td>
          </tr>
        `;
      }).join("");

  const body = `
    <div class="section-header">
      <h1>Email <em>delivery log</em></h1>
      <p class="section-sub">
        Every transactional email send in one place.
        ${stats ? `Last 24h: ${stats.total || 0} attempts, ${stats.failed || 0} failed.` : ""}
      </p>
    </div>

    <div class="card" style="margin-bottom:24px">
      <form method="GET" action="/admin/email-log" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;flex:1;min-width:200px">
          <label for="email">Recipient contains</label>
          <input id="email" name="email" type="text" value="${esc(emailFilter)}" placeholder="lance@">
        </div>
        <div class="form-group" style="margin:0">
          <label for="type">Type</label>
          <select id="type" name="type">
            <option value="">All</option>
            ${typeOptions}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label for="status">Status</label>
          <select id="status" name="status">
            <option value="">All</option>
            <option value="queued"${status === "queued" ? " selected" : ""}>Queued</option>
            <option value="failed"${status === "failed" ? " selected" : ""}>Failed</option>
          </select>
        </div>
        <button type="submit" class="btn">Filter</button>
        <a href="/admin/email-log" class="btn btn-ghost">Reset</a>
      </form>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Recipient</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  return html(layout("Email delivery log", body, user));
}

/**
 * Dashboard -- Scan Health Monitor (admin only)
 *
 * Shows scan freshness per domain, error rates, stale domains,
 * and scan volume over time. Quick visibility into operational health.
 */

import type { Env, User, Domain } from "../types";
import { layout, html, esc } from "../render";

interface ScanStat {
  domain_id: number;
  domain: string;
  client_slug: string;
  is_competitor: number;
  last_scan: number | null;
  scan_count: number;
  error_count: number;
  avg_score: number | null;
}

export async function handleScanHealth(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const thirtyDaysAgo = now - 30 * 86400;

  // Get all active domains with their latest scan info
  const domains = (await env.DB.prepare(`
    SELECT
      d.id as domain_id,
      d.domain,
      d.client_slug,
      d.is_competitor,
      MAX(sr.scanned_at) as last_scan,
      COUNT(sr.id) as scan_count,
      SUM(CASE WHEN sr.error IS NOT NULL AND sr.error != '' THEN 1 ELSE 0 END) as error_count,
      ROUND(AVG(sr.aeo_score), 0) as avg_score
    FROM domains d
    LEFT JOIN scan_results sr ON sr.domain_id = d.id
    WHERE d.active = 1
    GROUP BY d.id
    ORDER BY last_scan ASC NULLS FIRST
  `).all<ScanStat>()).results;

  // Categorize
  const neverScanned = domains.filter(d => !d.last_scan);
  const stale = domains.filter(d => d.last_scan && d.last_scan < sevenDaysAgo);
  const fresh = domains.filter(d => d.last_scan && d.last_scan >= sevenDaysAgo);
  const withErrors = domains.filter(d => d.error_count > 0);

  // Recent scan volume (last 30 days)
  const recentScans = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM scan_results WHERE scanned_at > ?"
  ).bind(thirtyDaysAgo).first<{ cnt: number }>();

  const recentErrors = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM scan_results WHERE scanned_at > ? AND error IS NOT NULL AND error != ''"
  ).bind(thirtyDaysAgo).first<{ cnt: number }>();

  // Recent error details
  const errorDetails = (await env.DB.prepare(`
    SELECT sr.error, sr.scanned_at, sr.url, d.domain, d.client_slug
    FROM scan_results sr
    JOIN domains d ON sr.domain_id = d.id
    WHERE sr.error IS NOT NULL AND sr.error != ''
    ORDER BY sr.scanned_at DESC
    LIMIT 15
  `).all<{ error: string; scanned_at: number; url: string; domain: string; client_slug: string }>()).results;

  const totalDomains = domains.length;
  const primaryDomains = domains.filter(d => !d.is_competitor).length;
  const errorRate = (recentScans?.cnt || 0) > 0
    ? ((recentErrors?.cnt || 0) / (recentScans?.cnt || 1) * 100).toFixed(1)
    : "0.0";

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/admin" style="color:var(--text-mute)">Cockpit</a>
      </div>
      <h1>Scan <em>Health</em></h1>
      <p style="color:var(--text-faint);font-size:13px;margin-top:8px">
        Operational status of AEO scans across all client domains.
      </p>
    </div>

    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0;border:1px solid var(--line);background:var(--bg-edge);margin-bottom:32px">
      ${statCell("Total Domains", String(totalDomains))}
      ${statCell("Primary", String(primaryDomains))}
      ${statCell("Fresh (7d)", String(fresh.length), fresh.length === totalDomains ? "var(--ok)" : "")}
      ${statCell("Stale", String(stale.length), stale.length > 0 ? "var(--danger)" : "")}
      ${statCell("Never Scanned", String(neverScanned.length), neverScanned.length > 0 ? "var(--danger)" : "")}
      ${statCell("Error Rate (30d)", errorRate + "%", parseFloat(errorRate) > 5 ? "var(--danger)" : "")}
    </div>

    <!-- Stale / Never Scanned -->
    ${(stale.length > 0 || neverScanned.length > 0) ? `
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px"><em style="color:var(--danger)">Attention needed</em></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Domain</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Client</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Type</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Last Scan</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Scans</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Errors</th>
            </tr>
          </thead>
          <tbody>
            ${[...neverScanned, ...stale].map(d => domainRow(d, now)).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : `
    <div style="margin-bottom:32px;padding:20px;background:rgba(127,201,154,.06);border:1px solid var(--ok);border-radius:4px;font-size:13px;color:var(--ok)">
      All domains have been scanned within the last 7 days.
    </div>
    `}

    <!-- Recent errors -->
    ${errorDetails.length > 0 ? `
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px"><em>Recent errors</em></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Domain</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">URL</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Error</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">When</th>
            </tr>
          </thead>
          <tbody>
            ${errorDetails.map(e => `
              <tr style="border-bottom:1px solid var(--line)">
                <td style="padding:10px 14px;color:var(--text-mute)">${esc(e.domain)}</td>
                <td style="padding:10px 14px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.url)}">${esc(truncateUrl(e.url))}</td>
                <td style="padding:10px 14px;color:var(--danger);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.error)}">${esc(e.error.slice(0, 80))}</td>
                <td style="padding:10px 14px;color:var(--text-faint)">${timeAgo(e.scanned_at, now)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : ""}

    <!-- All domains -->
    <div style="margin-bottom:32px">
      <h2 style="font-size:16px;font-weight:400;margin:0 0 14px">All <em>domains</em></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Domain</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Client</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Type</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Last Scan</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Scans</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Errors</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">Avg Score</th>
            </tr>
          </thead>
          <tbody>
            ${domains.map(d => domainRowFull(d, now)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return html(layout("Scan Health", body, user), 200);
}

// ---------- Render helpers ----------

function statCell(label: string, value: string, color?: string): string {
  return `
    <div style="padding:16px 14px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:4px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);font-family:var(--label)">${label}</div>
      <div style="font-family:var(--serif);font-size:26px${color ? `;color:${color}` : ''}">${value}</div>
    </div>`;
}

function domainRow(d: ScanStat, now: number): string {
  const scanAge = d.last_scan ? timeAgo(d.last_scan, now) : "Never";
  const scanColor = !d.last_scan ? "var(--danger)" : "var(--danger)";
  return `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:10px 14px"><a href="/domain/${d.domain_id}" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">${esc(d.domain)}</a></td>
      <td style="padding:10px 14px;color:var(--text-mute)">${esc(d.client_slug)}</td>
      <td style="padding:10px 14px;color:var(--text-faint)">${d.is_competitor ? "Competitor" : "Primary"}</td>
      <td style="padding:10px 14px;color:${scanColor}">${scanAge}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${d.scan_count}</td>
      <td style="padding:10px 14px;text-align:right;${d.error_count > 0 ? 'color:var(--danger)' : 'color:var(--text-mute)'}">${d.error_count}</td>
    </tr>`;
}

function domainRowFull(d: ScanStat, now: number): string {
  const scanAge = d.last_scan ? timeAgo(d.last_scan, now) : "Never";
  const sevenDays = 7 * 86400;
  let scanColor = "";
  if (!d.last_scan) scanColor = "color:var(--danger)";
  else if (d.last_scan < now - sevenDays) scanColor = "color:var(--danger)";
  else scanColor = "color:var(--ok)";

  return `
    <tr style="border-bottom:1px solid var(--line)">
      <td style="padding:10px 14px"><a href="/domain/${d.domain_id}" style="color:var(--gold);border-bottom:1px solid var(--gold-dim)">${esc(d.domain)}</a></td>
      <td style="padding:10px 14px;color:var(--text-mute)">${esc(d.client_slug)}</td>
      <td style="padding:10px 14px;color:var(--text-faint)">${d.is_competitor ? "Comp" : "Primary"}</td>
      <td style="padding:10px 14px;${scanColor}">${scanAge}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text-mute)">${d.scan_count}</td>
      <td style="padding:10px 14px;text-align:right;${d.error_count > 0 ? 'color:var(--danger)' : 'color:var(--text-mute)'}">${d.error_count}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--gold)">${d.avg_score !== null ? d.avg_score : "—"}</td>
    </tr>`;
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

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 40 ? u.pathname.slice(0, 37) + "..." : u.pathname;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "..." : url;
  }
}

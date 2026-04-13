/**
 * Dashboard — Domain detail route
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc } from "../render";

export async function handleDomainDetail(domainId: number, user: User, env: Env): Promise<Response> {
  // Get domain
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) {
    return html(layout("Not Found", `<div class="empty"><h3>Domain not found</h3></div>`, user), 404);
  }

  // Auth check: client can only see own domains
  if (user.role !== "admin" && user.client_slug !== domain.client_slug) {
    return html(layout("Not Found", `<div class="empty"><h3>Domain not found</h3></div>`, user), 404);
  }

  // Get latest scan
  const latest = await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 1"
  ).bind(domainId).first<ScanResult>();

  // Get scan history (last 12)
  const history = (await env.DB.prepare(
    "SELECT id, aeo_score, grade, scanned_at, scan_type, error FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 12"
  ).bind(domainId).all<ScanResult>()).results;

  // Build page
  let reportSection = "";
  if (latest && !latest.error) {
    const redFlags: string[] = JSON.parse(latest.red_flags);
    const techSignals: { label: string; value: string; status: string }[] = JSON.parse(latest.technical_signals);
    const schemaCoverage: { type: string; present: boolean }[] = JSON.parse(latest.schema_coverage);
    const scanDate = new Date(latest.scanned_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

    reportSection = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:start;margin-bottom:48px">
        <div style="text-align:center">
          <div class="grade grade-${latest.grade}" style="width:80px;height:80px;font-size:40px;margin-bottom:12px">${latest.grade}</div>
          <div class="score">${latest.aeo_score}<small>/100</small></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-faint);margin-bottom:8px">Last scanned ${scanDate} (${latest.scan_type})</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
            ${schemaCoverage.map(s => `
              <span style="padding:4px 10px;font-family:var(--label);text-transform:uppercase;letter-spacing:.15em;font-size:9px;font-weight:500;border:1px solid;border-radius:2px;${s.present ? 'color:var(--green);border-color:var(--green)' : 'color:var(--text-faint);border-color:var(--line)'}">
                ${esc(s.type)}
              </span>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Technical Signals -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Technical Signals</div>
        <table class="data-table">
          <thead><tr><th>Signal</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            ${techSignals.map(s => `
              <tr>
                <td style="font-weight:400">${esc(s.label)}</td>
                <td style="font-size:12px">${esc(s.value)}</td>
                <td>
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.status === 'good' ? 'var(--green)' : s.status === 'warning' ? 'var(--yellow)' : 'var(--red)'}"></span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Red Flags -->
      ${redFlags.length > 0 ? `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Red Flags (${redFlags.length})</div>
          ${redFlags.map(f => `
            <div style="padding:10px 16px;margin-bottom:8px;background:var(--bg-lift);border-left:3px solid var(--red);font-size:13px;color:var(--text-soft)">
              ${esc(f)}
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Red Flags</div>
          <div style="padding:16px;color:var(--green);font-size:13px">No red flags detected.</div>
        </div>
      `}
    `;
  } else if (latest && latest.error) {
    reportSection = `
      <div class="flash flash-error" style="margin-bottom:32px">
        Last scan failed: ${esc(latest.error)}
      </div>
    `;
  } else {
    reportSection = `
      <div class="empty" style="padding:40px">
        <h3>No scans yet</h3>
        <p>Trigger a scan to see the AEO report for this domain.</p>
      </div>
    `;
  }

  // History table
  let historySection = "";
  if (history.length > 0) {
    historySection = `
      <div style="margin-top:48px">
        <div class="label" style="margin-bottom:16px">Scan History</div>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Score</th><th>Grade</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            ${history.map(h => {
              const d = new Date(h.scanned_at * 1000);
              const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return `
                <tr>
                  <td>${dateStr}</td>
                  <td>${h.error ? '-' : h.aeo_score + '/100'}</td>
                  <td><span class="grade grade-${h.grade}" style="width:28px;height:28px;font-size:14px">${h.grade}</span></td>
                  <td style="color:var(--text-faint)">${h.scan_type}</td>
                  <td>${h.error ? `<span style="color:var(--red);font-size:12px">${esc(h.error)}</span>` : '<span style="color:var(--green)">OK</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(domain.client_slug)}
        </div>
        <h1><em>${esc(domain.domain)}</em></h1>
      </div>
      <form method="POST" action="/admin/scan/${domain.id}">
        <button type="submit" class="btn">Run scan</button>
      </form>
    </div>

    ${reportSection}
    ${historySection}
  `;

  return html(layout(domain.domain, body, user));
}

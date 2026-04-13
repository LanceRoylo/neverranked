/**
 * Dashboard — Domain detail route
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc } from "../render";
import { generateNarrative } from "../narrative";

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

  // Get latest + previous scan
  const recentScans = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
  ).bind(domainId).all<ScanResult>()).results;
  const latest = recentScans[0] || null;
  const previous = recentScans[1] || null;

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

    // Score delta
    let deltaHtml = "";
    if (previous && !previous.error) {
      const diff = latest.aeo_score - previous.aeo_score;
      if (diff > 0) {
        deltaHtml = `<div style="font-size:13px;color:var(--green);margin-top:4px">+${diff} pts</div>`;
      } else if (diff < 0) {
        deltaHtml = `<div style="font-size:13px;color:var(--red);margin-top:4px">${diff} pts</div>`;
      } else {
        deltaHtml = `<div style="font-size:13px;color:var(--text-faint);margin-top:4px">no change</div>`;
      }
    }

    // Generate narrative
    const narrative = generateNarrative(domain.domain, latest, previous);

    reportSection = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:start;margin-bottom:48px">
        <div style="text-align:center">
          <div class="grade grade-${latest.grade}" style="width:80px;height:80px;font-size:40px;margin-bottom:12px">${latest.grade}</div>
          <div class="score">${latest.aeo_score}<small>/100</small></div>
          ${deltaHtml}
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

      <!-- Executive Summary -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Executive Summary</div>
        <div style="padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;font-size:14px;line-height:1.75;color:var(--text-soft)">
          ${esc(narrative.summary)}
        </div>
      </div>

      ${narrative.changes.length > 0 ? `
      <!-- What Changed -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">What Changed</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${narrative.changes.map(c => {
            const color = c.type === "improved" || c.type === "resolved"
              ? "var(--green)" : "var(--red)";
            const icon = c.type === "improved" || c.type === "resolved"
              ? "+" : c.type === "regressed" || c.type === "new_issue" ? "-" : "~";
            return `
              <div style="display:flex;align-items:baseline;gap:12px;padding:8px 16px;background:var(--bg-lift);border-left:3px solid ${color};font-size:13px">
                <span style="color:${color};font-weight:500;font-family:var(--mono);flex-shrink:0">${icon}</span>
                <span style="color:var(--text-soft)">${esc(c.text)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${narrative.actions.length > 0 ? `
      <!-- Recommended Next Actions -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Recommended Next Actions</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${narrative.actions.map((a, i) => {
            const impactColor = a.impact === "high" ? "var(--red)"
              : a.impact === "medium" ? "var(--yellow)" : "var(--text-faint)";
            const impactLabel = a.impact === "high" ? "HIGH IMPACT"
              : a.impact === "medium" ? "MEDIUM" : "LOW";
            return `
              <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                  <span style="font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.15em;color:var(--text-faint)">${i + 1}</span>
                  <span style="font-size:14px;font-weight:400;color:var(--text)">${esc(a.action)}</span>
                  <span style="margin-left:auto;font-family:var(--label);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:${impactColor};border:1px solid ${impactColor};padding:2px 8px;border-radius:2px;flex-shrink:0">${impactLabel}</span>
                </div>
                <div style="font-size:12px;color:var(--text-faint);line-height:1.6;padding-left:28px">${esc(a.reason)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

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

  // Trend chart (SVG)
  let trendSection = "";
  const successfulScans = history.filter(h => !h.error && h.aeo_score > 0).reverse(); // oldest first
  if (successfulScans.length >= 2) {
    const W = 600;
    const H = 180;
    const PAD_X = 40;
    const PAD_Y = 24;
    const chartW = W - PAD_X * 2;
    const chartH = H - PAD_Y * 2;

    const scores = successfulScans.map(s => s.aeo_score);
    const minScore = Math.max(0, Math.min(...scores) - 10);
    const maxScore = Math.min(100, Math.max(...scores) + 10);
    const range = maxScore - minScore || 1;

    const points = successfulScans.map((s, i) => {
      const x = PAD_X + (i / (successfulScans.length - 1)) * chartW;
      const y = PAD_Y + chartH - ((s.aeo_score - minScore) / range) * chartH;
      return { x, y, score: s.aeo_score, date: new Date(s.scanned_at * 1000) };
    });

    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    // Gradient fill area
    const areaPath = `M ${points[0].x.toFixed(1)},${(PAD_Y + chartH).toFixed(1)} ${points.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L ${points[points.length - 1].x.toFixed(1)},${(PAD_Y + chartH).toFixed(1)} Z`;

    // Grid lines at 25-point intervals
    const gridLines: string[] = [];
    const gridLabels: string[] = [];
    for (let v = Math.ceil(minScore / 25) * 25; v <= maxScore; v += 25) {
      const y = PAD_Y + chartH - ((v - minScore) / range) * chartH;
      gridLines.push(`<line x1="${PAD_X}" y1="${y.toFixed(1)}" x2="${W - PAD_X}" y2="${y.toFixed(1)}" stroke="rgba(251,248,239,.1)" stroke-dasharray="4,4"/>`);
      gridLabels.push(`<text x="${PAD_X - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="rgba(251,248,239,.4)" font-size="10" font-family="var(--mono)">${v}</text>`);
    }

    // Date labels (first and last)
    const firstDate = points[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastDate = points[points.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Dots
    const dots = points.map(p =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>`
    ).join("\n");

    trendSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Score Trend</div>
        <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px;overflow-x:auto">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${gridLines.join("\n")}
            ${gridLabels.join("\n")}
            <path d="${areaPath}" fill="url(#areaGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            <text x="${PAD_X}" y="${H - 4}" fill="rgba(251,248,239,.4)" font-size="10" font-family="var(--mono)">${firstDate}</text>
            <text x="${W - PAD_X}" y="${H - 4}" text-anchor="end" fill="rgba(251,248,239,.4)" font-size="10" font-family="var(--mono)">${lastDate}</text>
          </svg>
        </div>
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
    ${trendSection}
    ${historySection}
  `;

  return html(layout(domain.domain, body, user));
}

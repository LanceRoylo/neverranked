/**
 * Dashboard — Domain detail route
 */

import type { Env, User, Domain, ScanResult, RoadmapItem } from "../types";
import { layout, html, esc } from "../render";
import { generateNarrative } from "../narrative";

async function buildProgressTimeline(clientSlug: string, env: Env): Promise<string> {
  const completedItems = (await env.DB.prepare(
    "SELECT title, category, completed_at FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 10"
  ).bind(clientSlug).all<{ title: string; category: string; completed_at: number }>()).results;

  if (completedItems.length === 0) return "";

  const categoryIcons: Record<string, string> = {
    schema: "{ }",
    content: "Aa",
    authority: "++",
    technical: "//",
  };

  const items = completedItems.map(item => {
    const date = new Date(item.completed_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const icon = categoryIcons[item.category] || "--";
    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="flex-shrink:0;width:32px;height:32px;background:var(--bg-edge);border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;color:var(--gold)">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:var(--text)">${esc(item.title)}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${esc(item.category)} -- completed ${date}</div>
        </div>
        <div style="color:#4ade80;font-size:11px;flex-shrink:0">Done</div>
      </div>`;
  }).join("");

  return `
    <div class="card" style="margin-top:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>What we've <em>done</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${completedItems.length} completed</span>
      </div>
      ${items}
    </div>
  `;
}

export async function handleDomainDetail(domainId: number, user: User, env: Env, requestUrl?: URL): Promise<Response> {
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

  // Get scan history (up to 52 weeks / 1 year)
  const history = (await env.DB.prepare(
    "SELECT id, aeo_score, grade, scanned_at, scan_type, error FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 52"
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

  // Trend chart (SVG) -- full history with grade bands
  let trendSection = "";
  const successfulScans = history.filter(h => !h.error && h.aeo_score > 0).reverse(); // oldest first
  if (successfulScans.length >= 2) {
    const W = 720;
    const H = 260;
    const PAD_L = 48;
    const PAD_R = 24;
    const PAD_T = 20;
    const PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Always show 0-100 scale for grade band context
    const minScore = 0;
    const maxScore = 100;
    const range = 100;

    const points = successfulScans.map((s, i) => {
      const x = PAD_L + (i / (successfulScans.length - 1)) * chartW;
      const y = PAD_T + chartH - ((s.aeo_score - minScore) / range) * chartH;
      return { x, y, score: s.aeo_score, grade: s.grade, date: new Date(s.scanned_at * 1000) };
    });

    const polyline = points.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");

    // Gradient fill area under the line
    const areaPath = "M " + points[0].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " " +
      points.map(p => "L " + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") +
      " L " + points[points.length - 1].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " Z";

    // Grade bands (D: 0-39, C: 40-59, B: 60-79, A: 80-100)
    const bands = [
      { min: 0, max: 39, color: "rgba(192,57,43,0.06)", label: "D" },
      { min: 40, max: 59, color: "rgba(230,126,34,0.06)", label: "C" },
      { min: 60, max: 79, color: "rgba(232,199,103,0.06)", label: "B" },
      { min: 80, max: 100, color: "rgba(94,199,106,0.06)", label: "A" },
    ];
    const bandRects = bands.map(b => {
      const y1 = PAD_T + chartH - ((b.max - minScore) / range) * chartH;
      const y2 = PAD_T + chartH - ((b.min - minScore) / range) * chartH;
      const bandH = y2 - y1;
      return '<rect x="' + PAD_L + '" y="' + y1.toFixed(1) + '" width="' + chartW + '" height="' + bandH.toFixed(1) + '" fill="' + b.color + '"/>' +
        '<text x="' + (W - PAD_R + 4) + '" y="' + ((y1 + y2) / 2 + 4).toFixed(1) + '" fill="rgba(251,248,239,.25)" font-size="11" font-family="var(--mono)" font-weight="500">' + b.label + '</text>';
    }).join("\n");

    // Grid lines at 20-point intervals
    const gridLines: string[] = [];
    const gridLabels: string[] = [];
    for (let v = 0; v <= 100; v += 20) {
      const y = PAD_T + chartH - ((v - minScore) / range) * chartH;
      gridLines.push('<line x1="' + PAD_L + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(251,248,239,.08)" stroke-dasharray="4,4"/>');
      gridLabels.push('<text x="' + (PAD_L - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" fill="rgba(251,248,239,.35)" font-size="10" font-family="var(--mono)">' + v + '</text>');
    }

    // Date labels -- distribute evenly, max 6 labels
    const dateLabels: string[] = [];
    const maxDateLabels = Math.min(6, points.length);
    for (let i = 0; i < maxDateLabels; i++) {
      const idx = maxDateLabels <= 1 ? 0 : Math.round(i * (points.length - 1) / (maxDateLabels - 1));
      const p = points[idx];
      const label = p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dateLabels.push('<text x="' + p.x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" fill="rgba(251,248,239,.35)" font-size="9" font-family="var(--mono)">' + label + '</text>');
    }

    // Dots -- all points get dots, key points get score labels
    const scores = successfulScans.map(s => s.aeo_score);
    const minIdx = scores.indexOf(Math.min(...scores));
    const maxIdx = scores.lastIndexOf(Math.max(...scores));
    const keyIndices = new Set([0, points.length - 1, minIdx, maxIdx]);

    const dots = points.map((p, i) => {
      const isKey = keyIndices.has(i);
      const r = isKey ? 5 : 3;
      let label = "";
      if (isKey) {
        const labelY = p.y - 10;
        label = '<text x="' + p.x.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle" fill="var(--text-mute)" font-size="11" font-family="var(--mono)" font-weight="500">' + p.score + '</text>';
      }
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>' + label;
    }).join("\n");

    // Summary line under the chart
    const first = points[0];
    const last = points[points.length - 1];
    const totalChange = last.score - first.score;
    const changeText = totalChange > 0
      ? '<span style="color:var(--green)">+' + totalChange + ' pts</span> since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : totalChange < 0
      ? '<span style="color:var(--red)">' + totalChange + ' pts</span> since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : 'No net change since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    trendSection = `
      <div style="margin-bottom:48px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
          <div class="label">Score Trend</div>
          <div style="font-size:12px;color:var(--text-faint)">${successfulScans.length} scans over ${Math.round((last.date.getTime() - first.date.getTime()) / 86400000)} days</div>
        </div>
        <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px;overflow-x:auto">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${bandRects}
            ${gridLines.join("\n")}
            ${gridLabels.join("\n")}
            <path d="${areaPath}" fill="url(#areaGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            ${dateLabels.join("\n")}
          </svg>
        </div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-faint);text-align:center">${changeText}</div>
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

  // Schema coverage matrix (per-page)
  let coverageSection = "";
  const pageScans = (await env.DB.prepare(
    "SELECT url, schema_types, aeo_score, grade FROM page_scans WHERE domain_id = ? ORDER BY url"
  ).bind(domainId).all<{ url: string; schema_types: string; aeo_score: number; grade: string }>()).results;

  if (pageScans.length > 0) {
    // Collect all unique schema types across all pages
    const allTypes = new Set<string>();
    const pageData = pageScans.map(ps => {
      const types: string[] = JSON.parse(ps.schema_types);
      types.forEach(t => allTypes.add(t));
      return { url: ps.url, types: new Set(types), score: ps.aeo_score, grade: ps.grade };
    });
    const schemaColumns = [...allTypes].sort();

    // Build short page labels from URLs
    const getPageLabel = (url: string): string => {
      try {
        const u = new URL(url);
        const p = u.pathname === "/" ? "Homepage" : u.pathname.replace(/\/$/, "").split("/").pop() || u.pathname;
        return p === "Homepage" ? p : `/${p}`;
      } catch {
        return url;
      }
    };

    if (schemaColumns.length > 0) {
      coverageSection = `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Schema Coverage by Page</div>
          <div style="overflow-x:auto;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${Math.max(500, 160 + schemaColumns.length * 90)}px">
              <thead>
                <tr style="border-bottom:1px solid var(--line)">
                  <th style="text-align:left;padding:12px 16px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint);position:sticky;left:0;background:var(--bg-lift);min-width:140px">Page</th>
                  ${schemaColumns.map(col => `
                    <th style="text-align:center;padding:12px 8px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:9px;color:var(--text-faint);white-space:nowrap">${esc(col)}</th>
                  `).join('')}
                  <th style="text-align:center;padding:12px 8px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint)">Score</th>
                </tr>
              </thead>
              <tbody>
                ${pageData.map(page => `
                  <tr style="border-bottom:1px solid rgba(251,248,239,.08)">
                    <td style="padding:10px 16px;font-size:12px;color:var(--text-soft);position:sticky;left:0;background:var(--bg-lift);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(page.url)}">${esc(getPageLabel(page.url))}</td>
                    ${schemaColumns.map(col => {
                      const has = page.types.has(col);
                      return `<td style="text-align:center;padding:10px 8px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;${has ? 'background:var(--green)' : 'background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12)'}"></span></td>`;
                    }).join('')}
                    <td style="text-align:center;padding:10px 8px"><span class="grade grade-${page.grade}" style="width:24px;height:24px;font-size:11px">${page.grade}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--text-faint);display:flex;gap:16px">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);vertical-align:middle;margin-right:4px"></span> Present</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12);vertical-align:middle;margin-right:4px"></span> Missing</span>
          </div>
        </div>
      `;
    }
  }

  // Check for share URL flash message
  const sharedUrl = requestUrl?.searchParams.get("shared") || "";
  const shareFlash = sharedUrl ? `
    <div style="margin-bottom:24px;padding:16px 20px;background:var(--gold-wash);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Shareable link created</div>
      <div style="display:flex;align-items:center;gap:12px">
        <input type="text" value="${esc(sharedUrl)}" readonly onclick="this.select()" style="flex:1;padding:8px 12px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;border-radius:2px">
        <button onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='Copied'" class="btn" style="padding:8px 16px;font-size:10px;white-space:nowrap">Copy link</button>
      </div>
      <div style="font-size:11px;color:var(--text-faint);margin-top:8px">Anyone with this link can view the report. No login required. Expires in 90 days.</div>
    </div>
  ` : "";

  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const body = `
    <div class="print-header" style="display:none">
      <div class="print-logo">Never Ranked</div>
      <div class="print-date">AEO Report -- ${esc(domain.domain)} -- ${printDate}</div>
    </div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(domain.client_slug)}
        </div>
        <h1><em>${esc(domain.domain)}</em></h1>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="window.print()" class="btn btn-ghost no-print">Export PDF</button>
        <form method="POST" action="/domain/${domain.id}/share">
          <button type="submit" class="btn btn-ghost no-print">Share report</button>
        </form>
        ${user.role === 'admin' ? `<form method="POST" action="/admin/scan/${domain.id}">
          <button type="submit" class="btn no-print">Run scan</button>
        </form>` : ''}
      </div>
    </div>

    ${shareFlash}
    ${reportSection}
    ${trendSection}
    ${await buildProgressTimeline(domain.client_slug, env)}
    ${coverageSection}
    ${historySection}
  `;

  return html(layout(domain.domain, body, user, domain.client_slug));
}

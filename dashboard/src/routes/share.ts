/**
 * Dashboard — Shareable public report
 *
 * Public read-only AEO report that clients forward to stakeholders.
 * No login required. Branded with NeverRanked CTA.
 */

import type { Env, Domain, ScanResult } from "../types";
import { esc } from "../render";
import { generateNarrative } from "../narrative";
import { CSS } from "../styles";

/** Create a share link for a domain */
export async function handleCreateShare(domainId: number, userId: number, env: Env): Promise<{ token: string }> {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const token = Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 90 * 24 * 60 * 60; // 90 days

  await env.DB.prepare(
    "INSERT INTO shared_reports (token, domain_id, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(token, domainId, userId, expiresAt, now).run();

  return { token };
}

/** Render public report */
export async function handlePublicReport(token: string, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  const share = await env.DB.prepare(
    "SELECT * FROM shared_reports WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)"
  ).bind(token, now).first<{ id: number; domain_id: number; created_at: number }>();

  if (!share) {
    return new Response(expiredPage(), { status: 404, headers: { "Content-Type": "text/html;charset=utf-8" } });
  }

  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ?"
  ).bind(share.domain_id).first<Domain>();

  if (!domain) {
    return new Response(expiredPage(), { status: 404, headers: { "Content-Type": "text/html;charset=utf-8" } });
  }

  // Get latest + previous scan
  const recentScans = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
  ).bind(share.domain_id).all<ScanResult>()).results;

  const latest = recentScans[0] || null;
  const previous = recentScans[1] || null;

  if (!latest || latest.error) {
    return new Response(noDataPage(domain.domain), { status: 200, headers: { "Content-Type": "text/html;charset=utf-8" } });
  }

  // Parse scan data
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const techSignals: { label: string; value: string; status: string }[] = JSON.parse(latest.technical_signals);
  const schemaCoverage: { type: string; present: boolean }[] = JSON.parse(latest.schema_coverage);
  const scanDate = new Date(latest.scanned_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Narrative
  const narrative = generateNarrative(domain.domain, latest, previous);

  // Score delta
  let deltaHtml = "";
  if (previous && !previous.error) {
    const diff = latest.aeo_score - previous.aeo_score;
    if (diff > 0) deltaHtml = `<div style="font-size:13px;color:var(--green);margin-top:4px">+${diff} pts</div>`;
    else if (diff < 0) deltaHtml = `<div style="font-size:13px;color:var(--red);margin-top:4px">${diff} pts</div>`;
    else deltaHtml = `<div style="font-size:13px;color:var(--text-faint);margin-top:4px">no change</div>`;
  }

  // Page scan data for schema matrix
  const pageScans = (await env.DB.prepare(
    "SELECT url, schema_types, aeo_score, grade FROM page_scans WHERE domain_id = ? ORDER BY url"
  ).bind(share.domain_id).all<{ url: string; schema_types: string; aeo_score: number; grade: string }>()).results;

  let coverageMatrix = "";
  if (pageScans.length > 0) {
    const allTypes = new Set<string>();
    const pageData = pageScans.map(ps => {
      const types: string[] = JSON.parse(ps.schema_types);
      types.forEach(t => allTypes.add(t));
      return { url: ps.url, types: new Set(types), score: ps.aeo_score, grade: ps.grade };
    });
    const schemaColumns = [...allTypes].sort();

    const getPageLabel = (url: string): string => {
      try {
        const u = new URL(url);
        const p = u.pathname === "/" ? "Homepage" : u.pathname.replace(/\/$/, "").split("/").pop() || u.pathname;
        return p === "Homepage" ? p : `/${p}`;
      } catch { return url; }
    };

    if (schemaColumns.length > 0) {
      coverageMatrix = `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Schema Coverage by Page</div>
          <div style="overflow-x:auto;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${Math.max(500, 160 + schemaColumns.length * 90)}px">
              <thead>
                <tr style="border-bottom:1px solid var(--line)">
                  <th style="text-align:left;padding:12px 16px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint);position:sticky;left:0;background:var(--bg-lift);min-width:140px">Page</th>
                  ${schemaColumns.map(col => `<th style="text-align:center;padding:12px 8px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:9px;color:var(--text-faint);white-space:nowrap">${esc(col)}</th>`).join("")}
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
                    }).join("")}
                    <td style="text-align:center;padding:10px 8px"><span class="grade grade-${page.grade}" style="width:24px;height:24px;font-size:11px">${page.grade}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  const body = `
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#121212">
    <title>AEO Report: ${esc(domain.domain)} — Never Ranked</title>
    <meta name="robots" content="noindex, nofollow">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>${CSS}</style>
    </head>
    <body>
    <div class="grain"></div>

    <!-- Header -->
    <div style="border-bottom:1px solid var(--line);padding:16px var(--gutter)">
      <div style="max-width:var(--max);margin:0 auto;display:flex;align-items:center;justify-content:space-between">
        <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--gold)">Never Ranked</div>
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-faint)">AEO Report</div>
      </div>
    </div>

    <main style="max-width:var(--max);margin:0 auto;padding:48px var(--gutter) 80px">

      <!-- Domain header -->
      <div style="margin-bottom:40px">
        <div class="label" style="margin-bottom:8px">Report for</div>
        <h1><em>${esc(domain.domain)}</em></h1>
        <div style="font-size:12px;color:var(--text-faint);margin-top:8px">Generated ${scanDate}</div>
      </div>

      <!-- Score + Grade -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:start;margin-bottom:48px">
        <div style="text-align:center">
          <div class="grade grade-${latest.grade}" style="width:100px;height:100px;font-size:52px;margin-bottom:12px">${latest.grade}</div>
          <div class="score">${latest.aeo_score}<small>/100</small></div>
          ${deltaHtml}
        </div>
        <div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;margin-top:8px">
            ${schemaCoverage.map(s => `
              <span style="padding:4px 10px;font-family:var(--label);text-transform:uppercase;letter-spacing:.15em;font-size:9px;font-weight:500;border:1px solid;border-radius:2px;${s.present ? 'color:var(--green);border-color:var(--green)' : 'color:var(--text-faint);border-color:var(--line)'}">
                ${esc(s.type)}
              </span>
            `).join("")}
          </div>
        </div>
      </div>

      <!-- Executive Summary -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Executive Summary</div>
        <div style="padding:24px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;font-size:15px;line-height:1.8;color:var(--text-soft)">
          ${esc(narrative.summary)}
        </div>
      </div>

      ${narrative.changes.length > 0 ? `
      <!-- What Changed -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">What Changed</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${narrative.changes.map(c => {
            const color = c.type === "improved" || c.type === "resolved" ? "var(--green)" : "var(--red)";
            const icon = c.type === "improved" || c.type === "resolved" ? "+" : "-";
            return `
              <div style="display:flex;align-items:baseline;gap:12px;padding:8px 16px;background:var(--bg-lift);border-left:3px solid ${color};font-size:13px">
                <span style="color:${color};font-weight:500;font-family:var(--mono);flex-shrink:0">${icon}</span>
                <span style="color:var(--text-soft)">${esc(c.text)}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      ` : ""}

      <!-- Recommended Next Actions -->
      ${narrative.actions.length > 0 ? `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Recommended Next Actions</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${narrative.actions.map((a, i) => {
            const impactColor = a.impact === "high" ? "var(--red)" : a.impact === "medium" ? "var(--yellow)" : "var(--text-faint)";
            const impactLabel = a.impact === "high" ? "HIGH IMPACT" : a.impact === "medium" ? "MEDIUM" : "LOW";
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
          }).join("")}
        </div>
      </div>
      ` : ""}

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
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.status === 'good' ? 'var(--green)' : s.status === 'warning' ? 'var(--yellow)' : 'var(--red)'}"></span></td>
              </tr>
            `).join("")}
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
        `).join("")}
      </div>
      ` : `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Red Flags</div>
        <div style="padding:16px;color:var(--green);font-size:13px">No red flags detected.</div>
      </div>
      `}

      ${coverageMatrix}

      <!-- CTA -->
      <div style="margin-top:64px;padding:40px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
        <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text);margin-bottom:12px">Ready to improve your AEO score?</div>
        <p style="color:var(--text-faint);font-size:14px;max-width:480px;margin:0 auto 24px;line-height:1.7">
          NeverRanked monitors your AI search visibility and gives you a clear roadmap to improve. See where you stand, track progress, and outperform competitors.
        </p>
        <a href="https://neverranked.com" style="display:inline-block;padding:14px 32px;background:var(--gold);color:#080808;font-family:var(--label);font-size:12px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;border-radius:2px">Learn more</a>
      </div>

    </main>

    <!-- Footer -->
    <div style="border-top:1px solid var(--line);padding:24px var(--gutter)">
      <div style="max-width:var(--max);margin:0 auto;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-faint)">
        <span>Powered by <a href="https://neverranked.com" style="color:var(--gold);text-decoration:none">NeverRanked</a></span>
        <span>Report generated ${scanDate}</span>
      </div>
    </div>

    </body>
    </html>
  `;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function expiredPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Report Expired</title>
  <style>body{background:#121212;color:#fbf8ef;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{text-align:center;max-width:400px;padding:40px}h1{font-style:italic;font-size:28px;margin-bottom:12px}p{color:rgba(251,248,239,.6);font-size:14px;line-height:1.7}
  a{color:#e8c767;text-decoration:none;border-bottom:1px solid rgba(232,199,103,.4)}</style></head>
  <body><div class="box"><h1>Report expired</h1><p>This report link is no longer active. Contact your account manager for a fresh link, or visit <a href="https://neverranked.com">neverranked.com</a>.</p></div></body></html>`;
}

function noDataPage(domain: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>No Data</title>
  <style>body{background:#121212;color:#fbf8ef;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{text-align:center;max-width:400px;padding:40px}h1{font-style:italic;font-size:28px;margin-bottom:12px}p{color:rgba(251,248,239,.6);font-size:14px;line-height:1.7}
  a{color:#e8c767;text-decoration:none;border-bottom:1px solid rgba(232,199,103,.4)}</style></head>
  <body><div class="box"><h1>Report pending</h1><p>The AEO report for ${domain} is still being generated. Check back shortly.</p></div></body></html>`;
}

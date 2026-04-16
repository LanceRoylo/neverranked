/**
 * Dashboard -- Monthly client report
 *
 * Aggregates AEO score changes, roadmap progress, citation movement,
 * GSC trends, and red flag changes into a single printable page.
 */

import type { Env, User, Domain, ScanResult, RoadmapItem, CitationSnapshot, GscSnapshot } from "../types";
import { layout, html, esc, redirect, safeParse, shortDate } from "../render";
import { canAccessClient } from "../agency";

interface MonthBounds {
  label: string;       // "April 2026"
  slug: string;        // "2026-04"
  startTs: number;     // unix start of month
  endTs: number;       // unix end of month
}

function parseMonth(monthSlug: string): MonthBounds | null {
  const match = monthSlug.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return {
    label,
    slug: monthSlug,
    startTs: Math.floor(start.getTime() / 1000),
    endTs: Math.floor(end.getTime() / 1000),
  };
}

function getCurrentMonthSlug(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getPrevMonthSlug(slug: string): string {
  const [y, m] = slug.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function getNextMonthSlug(slug: string): string {
  const [y, m] = slug.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Build a stat card */
function statCard(label: string, value: string, delta: string, deltaColor: string, sublabel?: string): string {
  return `
    <div style="flex:1;min-width:140px;padding:20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
      <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px">${esc(label)}</div>
      <div style="font-family:var(--mono);font-size:28px;color:var(--text);margin-bottom:4px">${value}</div>
      <div style="font-size:12px;color:${deltaColor}">${delta}</div>
      ${sublabel ? `<div style="font-size:10px;color:var(--text-faint);margin-top:4px">${esc(sublabel)}</div>` : ''}
    </div>
  `;
}

export async function handleReport(clientSlug: string, monthSlug: string, user: User, env: Env): Promise<Response> {
  // Auth
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", '<div class="empty"><h3>Page not found</h3></div>', user), 404);
  }

  const bounds = parseMonth(monthSlug);
  if (!bounds) return redirect(`/report/${clientSlug}/${getCurrentMonthSlug()}`);

  // Get primary domain
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<Domain>();

  if (!domain) {
    return html(layout("Report", '<div class="empty"><h3>No domain found for this client</h3></div>', user, clientSlug));
  }

  // ------------------------------------------------------------------
  // 1. AEO SCORE DATA
  // ------------------------------------------------------------------
  const monthScans = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at >= ? AND scanned_at < ? ORDER BY scanned_at ASC"
  ).bind(domain.id, bounds.startTs, bounds.endTs).all<ScanResult>()).results;

  // Score at start of month (last scan before the month)
  const priorScan = await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at < ? ORDER BY scanned_at DESC LIMIT 1"
  ).bind(domain.id, bounds.startTs).first<ScanResult>();

  const startScore = priorScan ? priorScan.aeo_score : (monthScans[0]?.aeo_score || null);
  const endScore = monthScans.length > 0 ? monthScans[monthScans.length - 1].aeo_score : startScore;
  const scoreDelta = startScore !== null && endScore !== null ? endScore - startScore : null;

  // ------------------------------------------------------------------
  // 2. RED FLAG ANALYSIS
  // ------------------------------------------------------------------
  let flagsResolved: string[] = [];
  let flagsNew: string[] = [];
  if (priorScan && monthScans.length > 0) {
    const startFlags: string[] = safeParse(priorScan.red_flags, []);
    const endFlags: string[] = safeParse(monthScans[monthScans.length - 1].red_flags, []);
    flagsResolved = startFlags.filter(f => !endFlags.includes(f));
    flagsNew = endFlags.filter(f => !startFlags.includes(f));
  }

  // ------------------------------------------------------------------
  // 3. SCHEMA CHANGES
  // ------------------------------------------------------------------
  let schemasAdded: string[] = [];
  let schemasRemoved: string[] = [];
  if (priorScan && monthScans.length > 0) {
    const startSchemas: string[] = safeParse(priorScan.schema_types, []);
    const endSchemas: string[] = safeParse(monthScans[monthScans.length - 1].schema_types, []);
    schemasAdded = endSchemas.filter(s => !startSchemas.includes(s));
    schemasRemoved = startSchemas.filter(s => !endSchemas.includes(s));
  }

  // ------------------------------------------------------------------
  // 4. ROADMAP PROGRESS
  // ------------------------------------------------------------------
  const completedItems = (await env.DB.prepare(
    "SELECT title, category, completed_at FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at >= ? AND completed_at < ? ORDER BY completed_at"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).all<{ title: string; category: string; completed_at: number }>()).results;

  const totalItems = await env.DB.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM roadmap_items WHERE client_slug = ?"
  ).bind(clientSlug).first<{ total: number; done: number }>();

  // ------------------------------------------------------------------
  // 5. CITATION DATA
  // ------------------------------------------------------------------
  const citSnapshots = (await env.DB.prepare(
    "SELECT * FROM citation_snapshots WHERE client_slug = ? AND created_at >= ? AND created_at < ? ORDER BY week_start ASC"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).all<CitationSnapshot>()).results;

  const priorCit = await env.DB.prepare(
    "SELECT * FROM citation_snapshots WHERE client_slug = ? AND created_at < ? ORDER BY week_start DESC LIMIT 1"
  ).bind(clientSlug, bounds.startTs).first<CitationSnapshot>();

  const latestCit = citSnapshots.length > 0 ? citSnapshots[citSnapshots.length - 1] : null;
  const startCitShare = priorCit ? priorCit.citation_share : (citSnapshots[0]?.citation_share || null);
  const endCitShare = latestCit ? latestCit.citation_share : startCitShare;

  // ------------------------------------------------------------------
  // 6. GSC DATA
  // ------------------------------------------------------------------
  const gscSnapshots = (await env.DB.prepare(
    "SELECT * FROM gsc_snapshots WHERE client_slug = ? AND created_at >= ? AND created_at < ? ORDER BY date_start ASC"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).all<GscSnapshot>()).results;

  const priorGsc = await env.DB.prepare(
    "SELECT * FROM gsc_snapshots WHERE client_slug = ? AND created_at < ? ORDER BY date_end DESC LIMIT 1"
  ).bind(clientSlug, bounds.startTs).first<GscSnapshot>();

  const latestGsc = gscSnapshots.length > 0 ? gscSnapshots[gscSnapshots.length - 1] : null;

  // ------------------------------------------------------------------
  // 7. ALERTS THIS MONTH
  // ------------------------------------------------------------------
  const alerts = (await env.DB.prepare(
    "SELECT type, title, detail, created_at FROM admin_alerts WHERE client_slug = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).all<{ type: string; title: string; detail: string | null; created_at: number }>()).results;

  // ------------------------------------------------------------------
  // BUILD THE PAGE
  // ------------------------------------------------------------------

  const prevSlug = getPrevMonthSlug(bounds.slug);
  const nextSlug = getNextMonthSlug(bounds.slug);
  const currentSlug = getCurrentMonthSlug();
  const isCurrentOrFuture = bounds.slug >= currentSlug;

  // Stat cards row
  const statsCards: string[] = [];

  // AEO score card
  if (endScore !== null) {
    const deltaText = scoreDelta !== null && scoreDelta !== 0
      ? (scoreDelta > 0 ? `+${scoreDelta} pts` : `${scoreDelta} pts`)
      : "no change";
    const deltaColor = scoreDelta && scoreDelta > 0 ? "var(--green)" : scoreDelta && scoreDelta < 0 ? "var(--red)" : "var(--text-faint)";
    statsCards.push(statCard("AEO Score", `${endScore}`, deltaText, deltaColor, `${monthScans.length} scan${monthScans.length !== 1 ? 's' : ''} this month`));
  }

  // Roadmap card
  if (totalItems && totalItems.total > 0) {
    const overallPct = Math.round(((totalItems.done || 0) / totalItems.total) * 100);
    statsCards.push(statCard("Roadmap", `${overallPct}%`, `${completedItems.length} item${completedItems.length !== 1 ? 's' : ''} completed`, completedItems.length > 0 ? "var(--green)" : "var(--text-faint)", `${totalItems.done || 0} of ${totalItems.total} total`));
  }

  // Citation card
  if (endCitShare !== null) {
    const endPct = (endCitShare * 100).toFixed(0);
    let citDelta = "first data";
    let citColor = "var(--text-faint)";
    if (startCitShare !== null && endCitShare !== null) {
      const diff = (endCitShare - startCitShare) * 100;
      citDelta = diff > 0.5 ? `+${diff.toFixed(0)}%` : diff < -0.5 ? `${diff.toFixed(0)}%` : "steady";
      citColor = diff > 0.5 ? "var(--green)" : diff < -0.5 ? "var(--red)" : "var(--text-faint)";
    }
    statsCards.push(statCard("Citation Share", `${endPct}%`, citDelta, citColor, latestCit ? `${latestCit.client_citations}/${latestCit.total_queries} queries` : undefined));
  }

  // GSC card
  if (latestGsc) {
    const clickDelta = priorGsc ? latestGsc.clicks - priorGsc.clicks : 0;
    const deltaText = priorGsc ? (clickDelta > 0 ? `+${clickDelta}` : clickDelta < 0 ? `${clickDelta}` : "no change") : "first data";
    const deltaColor = clickDelta > 0 ? "var(--green)" : clickDelta < 0 ? "var(--red)" : "var(--text-faint)";
    statsCards.push(statCard("Search Clicks", latestGsc.clicks.toLocaleString(), deltaText, deltaColor, `${latestGsc.impressions.toLocaleString()} impressions`));
  }

  // Red flags section
  let flagsSection = "";
  if (flagsResolved.length > 0 || flagsNew.length > 0) {
    flagsSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Red Flag Changes</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${flagsResolved.map(f => `
            <div style="padding:8px 16px;background:var(--bg-lift);border-left:3px solid var(--green);font-size:13px">
              <span style="color:var(--green);font-family:var(--mono);margin-right:8px">RESOLVED</span>
              <span style="color:var(--text-soft)">${esc(f)}</span>
            </div>
          `).join("")}
          ${flagsNew.map(f => `
            <div style="padding:8px 16px;background:var(--bg-lift);border-left:3px solid var(--red);font-size:13px">
              <span style="color:var(--red);font-family:var(--mono);margin-right:8px">NEW</span>
              <span style="color:var(--text-soft)">${esc(f)}</span>
            </div>
          `).join("")}
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-faint)">
          ${flagsResolved.length} resolved, ${flagsNew.length} new this month
        </div>
      </div>
    `;
  }

  // Schema changes section
  let schemaSection = "";
  if (schemasAdded.length > 0 || schemasRemoved.length > 0) {
    schemaSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Schema Changes</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${schemasAdded.map(s => `
            <span style="padding:6px 14px;background:rgba(94,199,106,.08);border:1px solid rgba(94,199,106,.2);border-radius:2px;font-size:12px;color:var(--green)">+ ${esc(s)}</span>
          `).join("")}
          ${schemasRemoved.map(s => `
            <span style="padding:6px 14px;background:rgba(232,84,84,.08);border:1px solid rgba(232,84,84,.2);border-radius:2px;font-size:12px;color:var(--red)">- ${esc(s)}</span>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Completed roadmap items
  let roadmapSection = "";
  if (completedItems.length > 0) {
    const categoryIcons: Record<string, string> = { schema: "{ }", content: "Aa", authority: "++", technical: "//" };
    roadmapSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Roadmap Items Completed (${completedItems.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${completedItems.map(item => {
            const date = shortDate(item.completed_at);
            const icon = categoryIcons[item.category] || "--";
            return `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg-lift);border-radius:4px">
                <div style="width:28px;height:28px;background:var(--bg-edge);border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;color:var(--gold);flex-shrink:0">${icon}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;color:var(--text)">${esc(item.title)}</div>
                  <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${esc(item.category)} -- ${date}</div>
                </div>
                <span style="color:var(--green);font-size:11px;flex-shrink:0">Done</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // Score trend mini-chart for the month
  let trendSection = "";
  if (monthScans.length >= 2) {
    const W = 500;
    const H = 120;
    const PAD = { l: 40, r: 16, t: 12, b: 24 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    const scores = monthScans.map(s => s.aeo_score);
    const minS = Math.min(...scores) - 5;
    const maxS = Math.max(...scores) + 5;
    const range = Math.max(maxS - minS, 10);

    const pts = monthScans.map((s, i) => ({
      x: PAD.l + (i / (monthScans.length - 1)) * cW,
      y: PAD.t + cH - ((s.aeo_score - minS) / range) * cH,
      score: s.aeo_score,
      date: new Date(s.scanned_at * 1000),
    }));

    const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `M ${pts[0].x.toFixed(1)},${(PAD.t + cH).toFixed(1)} ` +
      pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L ${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + cH).toFixed(1)} Z`;

    const dots = pts.map((p, i) => {
      const isEndpoint = i === 0 || i === pts.length - 1;
      const r = isEndpoint ? 4 : 2.5;
      let lbl = "";
      if (isEndpoint) {
        lbl = `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" fill="var(--text-mute)" font-size="11" font-family="var(--mono)" font-weight="500">${p.score}</text>`;
      }
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>${lbl}`;
    }).join("\n");

    const firstLabel = pts[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastLabel = pts[pts.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    trendSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:12px">Score Trend This Month</div>
        <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px;overflow-x:auto">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto">
            <defs>
              <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <line x1="${PAD.l}" y1="${PAD.t + cH}" x2="${W - PAD.r}" y2="${PAD.t + cH}" stroke="rgba(251,248,239,.1)"/>
            <path d="${area}" fill="url(#rptGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            <text x="${PAD.l}" y="${H - 4}" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${firstLabel}</text>
            <text x="${W - PAD.r}" y="${H - 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${lastLabel}</text>
          </svg>
        </div>
      </div>
    `;
  }

  // Alerts summary
  let alertsSection = "";
  if (alerts.length > 0) {
    const typeColors: Record<string, string> = {
      milestone: "var(--gold)", regression: "var(--red)", score_change: "var(--yellow)",
      auto_completed: "var(--green)", needs_review: "var(--yellow)", stale_item: "var(--yellow)",
    };
    alertsSection = `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Notable Events (${alerts.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${alerts.slice(0, 10).map(a => {
            const date = shortDate(a.created_at);
            const color = typeColors[a.type] || "var(--text-faint)";
            return `
              <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bg-lift);border-left:3px solid ${color};font-size:13px">
                <span style="flex:1;color:var(--text-soft)">${esc(a.title)}</span>
                <span style="font-size:11px;color:var(--text-faint);flex-shrink:0">${date}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // "No data" state
  const hasData = monthScans.length > 0 || completedItems.length > 0 || citSnapshots.length > 0 || gscSnapshots.length > 0;
  const noDataSection = !hasData ? `
    <div class="empty" style="padding:48px">
      <h3>No data for ${esc(bounds.label)}</h3>
      <p>Reports appear once scans, roadmap activity, or citation data exists for this month.</p>
    </div>
  ` : "";

  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const body = `
    <div class="print-header" style="display:none">
      <div class="print-logo">Never Ranked</div>
      <div class="print-date">Monthly Report -- ${esc(clientSlug)} -- ${esc(bounds.label)}</div>
    </div>

    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
        </div>
        <h1>Monthly <em>Report</em></h1>
        <div style="font-size:14px;color:var(--text-faint);margin-top:8px">${esc(domain.domain)} -- ${esc(bounds.label)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <a href="/report/${encodeURIComponent(clientSlug)}/${prevSlug}" class="btn btn-ghost no-print" style="padding:6px 12px;font-size:11px">&larr; ${prevSlug}</a>
        ${!isCurrentOrFuture ? `<a href="/report/${encodeURIComponent(clientSlug)}/${nextSlug}" class="btn btn-ghost no-print" style="padding:6px 12px;font-size:11px">${nextSlug} &rarr;</a>` : ''}
        <button onclick="window.print()" class="btn btn-ghost no-print" style="padding:6px 12px;font-size:11px">Print / PDF</button>
        ${user.role === "admin" ? `
          <form method="POST" action="/report/${encodeURIComponent(clientSlug)}/${bounds.slug}/send">
            <button type="submit" class="btn no-print" style="padding:6px 12px;font-size:11px">Email to client</button>
          </form>
        ` : ''}
      </div>
    </div>

    ${noDataSection}

    ${hasData ? `
      <!-- Key metrics -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:48px">
        ${statsCards.join("")}
      </div>

      ${trendSection}
      ${flagsSection}
      ${schemaSection}
      ${roadmapSection}
      ${alertsSection}

      <!-- Report footer -->
      <div style="margin-top:48px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
        <div style="font-size:13px;color:var(--text-faint);line-height:1.7">
          Generated ${printDate} by <span style="color:var(--gold)">NeverRanked</span>.
          View the live dashboard at <a href="https://app.neverranked.com" style="color:var(--gold)">app.neverranked.com</a>
        </div>
      </div>
    ` : ''}
  `;

  return html(layout(`Report: ${bounds.label}`, body, user, clientSlug));
}

/** Available months that have data for the month picker */
export async function handleReportIndex(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", '<div class="empty"><h3>Page not found</h3></div>', user), 404);
  }

  // Redirect to current month
  return redirect(`/report/${clientSlug}/${getCurrentMonthSlug()}`);
}

/** Send the monthly report to the client via email */
export async function handleSendReport(clientSlug: string, monthSlug: string, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return redirect(`/report/${clientSlug}/${monthSlug}`);

  const bounds = parseMonth(monthSlug);
  if (!bounds) return redirect(`/report/${clientSlug}/${getCurrentMonthSlug()}`);

  // Get client users
  const clients = (await env.DB.prepare(
    "SELECT email, name FROM users WHERE client_slug = ? AND role = 'client'"
  ).bind(clientSlug).all<{ email: string; name: string | null }>()).results;

  if (clients.length === 0 || !env.RESEND_API_KEY) {
    return redirect(`/report/${clientSlug}/${monthSlug}`);
  }

  // Get domain and latest score
  const domain = await env.DB.prepare(
    "SELECT domain FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<{ domain: string }>();

  const latestScan = await env.DB.prepare(
    "SELECT aeo_score, grade FROM scan_results WHERE domain_id IN (SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0) AND error IS NULL AND scanned_at >= ? AND scanned_at < ? ORDER BY scanned_at DESC LIMIT 1"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).first<{ aeo_score: number; grade: string }>();

  const completedCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?"
  ).bind(clientSlug, bounds.startTs, bounds.endTs).first<{ cnt: number }>();

  const origin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const reportUrl = `${origin}/report/${encodeURIComponent(clientSlug)}/${monthSlug}`;

  const scoreText = latestScan ? `Your AEO score is ${latestScan.aeo_score}/100 (Grade ${latestScan.grade}).` : "";
  const roadmapText = completedCount && completedCount.cnt > 0 ? `${completedCount.cnt} roadmap item${completedCount.cnt !== 1 ? "s were" : " was"} completed this month.` : "";

  const emailHtml = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1a1a1a">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:24px">NeverRanked Monthly Report</div>
      <h1 style="font-size:24px;font-weight:400;margin-bottom:8px">${bounds.label}</h1>
      <p style="color:#666;font-size:14px;margin-bottom:32px">${domain ? domain.domain : clientSlug}</p>
      <p style="font-size:15px;line-height:1.7;color:#333">
        Your monthly AEO report for ${bounds.label} is ready.
        ${scoreText} ${roadmapText}
      </p>
      <div style="margin:32px 0">
        <a href="${reportUrl}" style="display:inline-block;padding:14px 32px;background:#1a1a1a;color:#fff;text-decoration:none;font-size:14px;letter-spacing:1px;border-radius:2px">View Full Report</a>
      </div>
      <p style="font-size:13px;color:#888;line-height:1.6">
        Log in to your dashboard to see the complete breakdown including score changes, schema updates, citation tracking, and your roadmap progress.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
      <p style="font-size:11px;color:#aaa">NeverRanked -- AI Engine Optimization</p>
    </div>
  `;

  // Send to all client users
  for (const client of clients) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "NeverRanked <reports@neverranked.com>",
          to: [client.email],
          subject: `Your ${bounds.label} AEO Report -- ${domain?.domain || clientSlug}`,
          html: emailHtml,
        }),
      });
    } catch (e) {
      console.log(`Failed to send report email to ${client.email}: ${e}`);
    }
  }

  // Create admin alert tracking the send
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'report_sent', ?, ?, ?)"
  ).bind(clientSlug, `${bounds.label} report emailed to ${clients.length} recipient${clients.length !== 1 ? 's' : ''}`, clients.map(c => c.email).join(", "), now).run();

  return redirect(`/report/${clientSlug}/${monthSlug}?sent=1`);
}

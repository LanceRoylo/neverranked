/**
 * Demo mode -- Public read-only dashboard for Meridian Dental
 *
 * Three curated pages: domain detail, citations, roadmap.
 * No auth required. No DB queries. All data from fixtures.
 * POST routes return a styled "disabled" message.
 */

import { CSS } from "../styles";
import { esc } from "../render";
import {
  DEMO_SLUG, DEMO_DOMAIN, DEMO_DOMAIN_ID,
  SCAN_HISTORY, LATEST_SCAN, PREVIOUS_SCAN, LATEST_SCAN_FULL,
  PROJECTION, CITATION_SNAPSHOTS,
  CITATION_KEYWORDS, CITATION_COMPETITORS, CITATION_MATRIX,
  CONTENT_GAPS, ROADMAP_PHASES, ROADMAP_ITEMS,
  GSC_DATA, PAGE_SCANS,
} from "../demo-fixtures";

// ---------------------------------------------------------------------------
// Demo layout (mirrors render.ts layout but with demo banner + limited nav)
// ---------------------------------------------------------------------------

function demoLayout(title: string, body: string, activePage: string): string {
  const linkBase = "font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:11px;padding:4px 0;transition:color .2s;";
  const linkFor = (page: string) => `${linkBase}color:${activePage === page ? 'var(--gold)' : 'var(--text-faint)'};`;
  const navLinks = `
    <a href="/demo/domain" style="${linkFor('domain')}">Dashboard</a>
    <a href="/demo/citations" style="${linkFor('citations')}">Citations</a>
    <a href="/demo/roadmap" style="${linkFor('roadmap')}">Roadmap</a>
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>${esc(title)} — Never Ranked Demo</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>${CSS}
.demo-banner{
  position:sticky;top:0;z-index:90;
  background:var(--gold);color:#080808;
  padding:10px 20px;
  display:flex;align-items:center;justify-content:center;gap:16px;
  font-family:var(--label);font-size:12px;font-weight:500;
  letter-spacing:.12em;text-transform:uppercase;
  flex-wrap:wrap;text-align:center;
}
.demo-banner a{
  display:inline-block;
  padding:6px 16px;
  background:#080808;color:var(--gold);
  font-size:11px;letter-spacing:.14em;
  text-decoration:none;
  transition:opacity .3s;
}
.demo-banner a:hover{opacity:.8}

/* -- Demo mobile overrides -- */
@media(max-width:640px){
  .demo-banner{flex-direction:column;gap:10px;padding:12px 16px}
  .demo-gsc-grid{grid-template-columns:repeat(2,1fr) !important}
  .demo-two-col{grid-template-columns:1fr !important;gap:24px !important}
  .demo-three-col{grid-template-columns:1fr !important}
  .demo-score-headline{flex-direction:column;align-items:flex-start !important;gap:16px !important}
  .demo-score-headline .grade-ring{align-self:center}
  .demo-projection-row{flex-direction:row;flex-wrap:wrap;align-items:center !important;gap:16px !important}
  .demo-projection-row>div:last-child{min-width:100% !important;margin-top:8px}
  .demo-nav-actions{flex-direction:column}
  .demo-nav-actions>div{width:100% !important}
  .demo-banner span{font-size:11px;line-height:1.5}
}
</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>

<div class="demo-banner">
  <span>You are viewing sample data. This is what your dashboard looks like as a client.</span>
  <a href="https://app.neverranked.com/checkout/audit">Start with the $500 audit</a>
</div>

<header class="topbar">
  <a href="/demo/domain" class="mark">Never Ranked<sup>demo</sup></a>
  <div style="display:flex;align-items:center;gap:28px">${navLinks}</div>
  <div style="font-family:var(--mono);font-size:12px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <span style="color:var(--text-faint)">demo@meridiandental.com</span>
    <a href="https://neverranked.com" style="color:var(--gold);text-decoration:none">Back to site</a>
  </div>
</header>

<main class="page">
${body}
</main>

</body>
</html>`;
}

function demoHtml(content: string, status = 200): Response {
  return new Response(content, { status, headers: { "Content-Type": "text/html;charset=utf-8" } });
}

function demoRedirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

// ---------------------------------------------------------------------------
// Shared rendering helpers
// ---------------------------------------------------------------------------

function shortDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function gradeColor(grade: string): string {
  if (grade === "A") return "var(--green)";
  if (grade === "B") return "var(--gold)";
  if (grade === "C") return "var(--yellow)";
  return "var(--red)";
}

// ---------------------------------------------------------------------------
// Domain detail page
// ---------------------------------------------------------------------------

function renderDomainPage(): string {
  const latest = LATEST_SCAN_FULL;
  const prev = PREVIOUS_SCAN;
  const scoreDiff = latest.aeo_score - prev.aeo_score;
  const diffHtml = scoreDiff > 0
    ? `<span style="color:var(--green)">+${scoreDiff}</span>`
    : scoreDiff < 0 ? `<span style="color:var(--red)">${scoreDiff}</span>` : `<span style="color:var(--text-faint)">--</span>`;

  // Score history chart (inline SVG)
  const W = 600, H = 180, PAD_L = 40, PAD_R = 20, PAD_T = 20, PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const scores = SCAN_HISTORY.map(s => s.aeo_score);
  const maxScore = Math.max(...scores, 80);
  const minScore = Math.min(...scores, 20);
  const range = maxScore - minScore || 1;

  const chartPoints = SCAN_HISTORY.map((s, i) => {
    const x = PAD_L + (i / (SCAN_HISTORY.length - 1)) * chartW;
    const y = PAD_T + chartH - ((s.aeo_score - minScore) / range) * chartH;
    return { x, y, score: s.aeo_score, date: shortDate(s.scanned_at) };
  });
  const polyline = chartPoints.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const areaPath = "M " + chartPoints[0].x.toFixed(1) + "," + (PAD_T + chartH) +
    " " + chartPoints.map(p => "L " + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") +
    " L " + chartPoints[chartPoints.length - 1].x.toFixed(1) + "," + (PAD_T + chartH) + " Z";

  const chartSvg = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">
      <defs>
        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${PAD_L}" y1="${PAD_T + chartH}" x2="${W - PAD_R}" y2="${PAD_T + chartH}" stroke="rgba(251,248,239,.1)"/>
      <path d="${areaPath}" fill="url(#scoreGrad)"/>
      <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${chartPoints.map((p, i) => i === chartPoints.length - 1 ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>` : '').join('')}
      <text x="${PAD_L}" y="${H - 4}" fill="rgba(251,248,239,.3)" font-size="10" font-family="var(--mono)">${chartPoints[0].date}</text>
      <text x="${W - PAD_R}" y="${H - 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="10" font-family="var(--mono)">${chartPoints[chartPoints.length - 1].date}</text>
    </svg>`;

  // Schema coverage
  const schemaCoverage: { type: string; present: boolean }[] = JSON.parse(latest.schema_coverage);
  const schemaRows = schemaCoverage.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(251,248,239,.06)">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;${s.present ? 'background:var(--green)' : 'background:transparent;border:1.5px solid var(--red)'}"></span>
      <span style="font-size:13px;color:${s.present ? 'var(--text)' : 'var(--text-faint)'}">${esc(s.type)}</span>
      <span style="margin-left:auto;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${s.present ? 'var(--green)' : 'var(--red)'}">${s.present ? 'FOUND' : 'MISSING'}</span>
    </div>`).join("");

  // Red flags
  const redFlags: string[] = JSON.parse(latest.red_flags);
  const flagRows = redFlags.map(f => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(251,248,239,.06)">
      <span style="color:var(--red);font-size:12px;flex-shrink:0;margin-top:1px">!!</span>
      <span style="font-size:13px;color:var(--text-soft)">${esc(f)}</span>
    </div>`).join("");

  // Technical signals
  const signals: { label: string; value: string; status: string }[] = JSON.parse(latest.technical_signals);
  const signalRows = signals.map(s => {
    const color = s.status === "good" ? "var(--green)" : s.status === "warning" ? "var(--yellow)" : "var(--red)";
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(251,248,239,.06)">
      <span style="font-size:13px;color:var(--text)">${esc(s.label)}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text-faint)">${esc(s.value)}</span>
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
      </div>
    </div>`;
  }).join("");

  // Score projection
  const proj = PROJECTION;
  const gainBreakdown = proj.gains.map(g => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(251,248,239,.06)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${esc(g.category.charAt(0).toUpperCase() + g.category.slice(1))}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${g.count} item${g.count !== 1 ? 's' : ''}</span>
      </div>
      <span style="font-family:var(--mono);font-size:12px;color:var(--green)">+${g.points} pts</span>
    </div>`).join("");

  // Citation trend chart
  const citW = 400, citH = 120, cPAD_L = 36, cPAD_R = 16, cPAD_T = 12, cPAD_B = 24;
  const citChartW = citW - cPAD_L - cPAD_R;
  const citChartH = citH - cPAD_T - cPAD_B;
  const shares = CITATION_SNAPSHOTS.map(s => s.citation_share * 100);
  const citMax = Math.max(...shares, 20);
  const citPoints = CITATION_SNAPSHOTS.map((s, i) => {
    const x = cPAD_L + (i / (CITATION_SNAPSHOTS.length - 1)) * citChartW;
    const pct = s.citation_share * 100;
    const y = cPAD_T + citChartH - (pct / citMax) * citChartH;
    return { x, y, pct, date: new Date(s.week_start * 1000) };
  });
  const citPoly = citPoints.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const citArea = "M " + citPoints[0].x.toFixed(1) + "," + (cPAD_T + citChartH) + " " +
    citPoints.map(p => "L " + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") +
    " L " + citPoints[citPoints.length - 1].x.toFixed(1) + "," + (cPAD_T + citChartH) + " Z";

  const latestCit = CITATION_SNAPSHOTS[CITATION_SNAPSHOTS.length - 1];
  const prevCit = CITATION_SNAPSHOTS[CITATION_SNAPSHOTS.length - 2];
  const citDiff = (latestCit.citation_share - prevCit.citation_share) * 100;
  const citDiffText = citDiff > 0.5 ? `<span style="color:var(--green)">+${citDiff.toFixed(0)}%</span>` :
    citDiff < -0.5 ? `<span style="color:var(--red)">${citDiff.toFixed(0)}%</span>` :
    `<span style="color:var(--text-faint)">steady</span>`;

  const citFirstDate = shortDate(CITATION_SNAPSHOTS[0].week_start);
  const citLastDate = shortDate(CITATION_SNAPSHOTS[CITATION_SNAPSHOTS.length - 1].week_start);

  // Content gaps
  const gapsByCategory = new Map<string, typeof CONTENT_GAPS>();
  for (const g of CONTENT_GAPS) {
    const arr = gapsByCategory.get(g.category) || [];
    arr.push(g);
    gapsByCategory.set(g.category, arr);
  }
  const gapBlocks = [...gapsByCategory.entries()].map(([cat, items]) => {
    const rows = items.map(item => `
      <div style="padding:12px 16px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;margin-bottom:8px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;color:var(--text);margin-bottom:4px">${esc(item.keyword)}</div>
            <div style="font-size:11px;color:var(--text-faint)">Competitors cited: ${esc(item.competitors.join(", "))}</div>
          </div>
          <div style="flex-shrink:0;text-align:right">
            <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:2px;white-space:nowrap">Not cited</div>
            <div style="font-size:10px;color:var(--text-faint);margin-top:4px">${item.engines.join(", ")}</div>
          </div>
        </div>
      </div>`).join("");
    return `
      <div style="margin-bottom:16px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">${esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
        ${rows}
      </div>`;
  }).join("");

  // Page scans
  const pageRows = PAGE_SCANS.map(p => {
    const color = p.score >= 70 ? "var(--green)" : p.score >= 50 ? "var(--yellow)" : "var(--red)";
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.06)">
      <span style="font-family:var(--mono);font-size:13px;color:var(--text)">${esc(p.path)}</span>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:11px;color:var(--text-faint)">${p.schemas_found} found, ${p.schemas_missing} missing</span>
        <span style="font-family:var(--mono);font-size:12px;color:${color}">${p.score}%</span>
      </div>
    </div>`;
  }).join("");

  // GSC summary
  const clicksDiff = GSC_DATA.clicks - GSC_DATA.prevClicks;
  const clicksDiffHtml = clicksDiff > 0
    ? `<span style="color:var(--green)">+${clicksDiff}</span>`
    : `<span style="color:var(--red)">${clicksDiff}</span>`;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px">
      <div>
        <h2 style="font-family:var(--serif);font-size:clamp(20px,3vw,28px);font-weight:400;margin:0">${esc(DEMO_DOMAIN)}</h2>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Client: Meridian Dental</div>
      </div>
      <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">
        Last scan: ${shortDate(latest.scanned_at)}
      </div>
    </div>

    <!-- Executive Summary -->
    <div style="margin-bottom:32px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div class="label" style="margin-bottom:12px">Executive Summary</div>
      <div style="font-size:14px;line-height:1.75;color:var(--text-soft)">meridiandental.com scored 68/100 (B), improved by 3 points since the last scan. Schema coverage is solid with 5 types detected, though AggregateRating, Review, Service, and Article are still missing. There are 3 red flags to address, and page speed at 2.1 seconds is a moderate drag on the score. The upward trend over the last 12 weeks is strong.</div>
    </div>

    <!-- Score headline -->
    <div class="card" style="margin-bottom:32px">
      <div class="demo-score-headline" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
        <div class="grade-ring" style="width:80px;height:80px;border-radius:50%;border:3px solid ${gradeColor(latest.grade)};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-family:var(--serif);font-size:36px;font-style:italic;color:${gradeColor(latest.grade)}">${latest.grade}</span>
        </div>
        <div>
          <div style="font-family:var(--mono);font-size:48px;color:var(--text);line-height:1">${latest.aeo_score}<span style="font-size:18px;color:var(--text-faint)">/100</span></div>
          <div style="font-size:13px;color:var(--text-faint);margin-top:4px">AEO Score (${diffHtml} vs last week)</div>
        </div>
      </div>
    </div>

    <!-- Score history -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">Score History (12 weeks)</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px">
        ${chartSvg}
        <div style="font-size:12px;color:var(--text-faint);line-height:1.7;margin-top:12px;padding-top:12px;border-top:1px solid rgba(251,248,239,.06)">Score has climbed 34 points since week one, from D-grade to B-grade. The steepest gains came in the first 6 weeks when foundational schema was deployed. Growth is now steadier as remaining improvements are more incremental.</div>
      </div>
    </div>

    <!-- Score projection -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Score Projection</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Estimated score if all remaining roadmap items are completed. Based on typical impact per category.</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:24px">
        <div class="demo-projection-row" style="display:flex;align-items:center;gap:24px;margin-bottom:20px;flex-wrap:wrap">
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-size:32px;color:var(--text)">${proj.currentScore}</div>
            <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-top:4px">Current</div>
          </div>
          <div style="font-family:var(--mono);font-size:20px;color:var(--text-faint)">-></div>
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-size:32px;color:var(--gold)">${proj.projectedScore}</div>
            <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-top:4px">Projected</div>
          </div>
          <div style="flex:1;min-width:200px">
            <div style="position:relative;height:24px;background:var(--bg-edge);border-radius:12px;overflow:hidden">
              <div style="position:absolute;left:0;top:0;height:100%;width:${proj.projectedScore}%;background:rgba(232,199,103,.15);border-radius:12px"></div>
              <div style="position:absolute;left:0;top:0;height:100%;width:${proj.currentScore}%;background:var(--gold);border-radius:12px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px">
              <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">0</span>
              <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">100</span>
            </div>
          </div>
        </div>
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Estimated gains by category</div>
        ${gainBreakdown}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;margin-top:4px">
          <span style="font-size:12px;color:var(--text-faint)">${proj.doneItems} of ${proj.totalItems} items completed</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--green);font-weight:500">+${proj.projectedScore - proj.currentScore} pts potential</span>
        </div>
        <div style="font-size:12px;color:var(--text-faint);line-height:1.7;margin-top:12px;padding-top:12px;border-top:1px solid rgba(251,248,239,.06)">Completing the remaining 11 roadmap items would bring the score to an estimated 82. The biggest gains come from adding missing schema types (AggregateRating, Review, Service) and creating pillar content for high-value keywords.</div>
      </div>
    </div>

    <!-- Citation trend -->
    <div style="margin-bottom:48px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
        <div class="label">Citation Share Trend</div>
        <a href="/demo/citations" style="font-size:11px;color:var(--gold)">Full report -></a>
      </div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
          <span style="font-family:var(--mono);font-size:24px;color:var(--text)">${(latestCit.citation_share * 100).toFixed(0)}%</span>
          <span style="font-size:12px;color:var(--text-faint)">citation share (${citDiffText} vs last week)</span>
        </div>
        <svg viewBox="0 0 ${citW} ${citH}" width="100%" style="max-width:${citW}px;display:block">
          <defs>
            <linearGradient id="citGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line x1="${cPAD_L}" y1="${cPAD_T + citChartH}" x2="${citW - cPAD_R}" y2="${cPAD_T + citChartH}" stroke="rgba(251,248,239,.1)"/>
          <path d="${citArea}" fill="url(#citGrad)"/>
          <polyline points="${citPoly}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${citPoints.map((p, i) => i === citPoints.length - 1 ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>` : '').join('')}
          <text x="${cPAD_L}" y="${citH - 4}" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${citFirstDate}</text>
          <text x="${citW - cPAD_R}" y="${citH - 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${citLastDate}</text>
        </svg>
        <div style="font-size:11px;color:var(--text-faint);margin-top:8px">${latestCit.client_citations} of ${latestCit.total_queries} tracked queries cite you</div>
        <div style="font-size:12px;color:var(--text-faint);line-height:1.7;margin-top:12px;padding-top:12px;border-top:1px solid rgba(251,248,239,.06)">Citation share has grown from 5% to 35% over 12 weeks. AI engines are citing Meridian Dental for 7 of 20 tracked queries, primarily on ChatGPT and Perplexity. The remaining 13 queries are opportunities where competitors are being cited instead.</div>
      </div>
    </div>

    <!-- GSC summary -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">Search Console</div>
      <div class="demo-gsc-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        <div class="card" style="text-align:center">
          <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${GSC_DATA.clicks.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Clicks (${clicksDiffHtml})</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${GSC_DATA.impressions.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Impressions</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${GSC_DATA.ctr}%</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">CTR</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${GSC_DATA.position}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Avg Position</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-faint);line-height:1.7;margin-top:12px">Clicks are up 15% week-over-week. Top performing query is "dentist downtown" with 180 clicks. Average position of 14.2 means most pages rank on page two -- improving schema and content depth should push key pages onto page one.</div>
    </div>

    <!-- Recommended next actions -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">Recommended Next Actions</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <span style="font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.15em;color:var(--text-faint)">1</span>
            <span style="font-size:14px;color:var(--text)">Add AggregateRating schema with Google review data</span>
            <span style="margin-left:auto;font-family:var(--label);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:2px;flex-shrink:0">HIGH IMPACT</span>
          </div>
          <div style="font-size:12px;color:var(--text-faint);line-height:1.6;padding-left:28px">AI engines weight review signals heavily when deciding who to cite for "best" and "recommended" queries. This is the single biggest lever for the next score jump.</div>
        </div>
        <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <span style="font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.15em;color:var(--text-faint)">2</span>
            <span style="font-size:14px;color:var(--text)">Create a dental implants pillar article (2,000+ words)</span>
            <span style="margin-left:auto;font-family:var(--label);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:2px;flex-shrink:0">HIGH IMPACT</span>
          </div>
          <div style="font-size:12px;color:var(--text-faint);line-height:1.6;padding-left:28px">Both competitors are being cited for "dental implants cost" and Meridian is not. A comprehensive guide with FAQ schema and cost breakdowns would give AI engines a citable source.</div>
        </div>
        <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <span style="font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.15em;color:var(--text-faint)">3</span>
            <span style="font-size:14px;color:var(--text)">Extend meta description to 120-160 characters</span>
            <span style="margin-left:auto;font-family:var(--label);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--yellow);border:1px solid var(--yellow);padding:2px 8px;border-radius:2px;flex-shrink:0">MEDIUM</span>
          </div>
          <div style="font-size:12px;color:var(--text-faint);line-height:1.6;padding-left:28px">Current meta description is only 43 characters. AI models and search engines use this as a summary signal. A descriptive meta between 120-160 characters improves both click-through rate and AI comprehension.</div>
        </div>
      </div>
    </div>

    <!-- Content opportunities -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Content Opportunities</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Keywords where competitors get cited by AI engines but you don't. Each gap generates a content recommendation in your <a href="/demo/roadmap" style="color:var(--gold);text-decoration:none">roadmap</a>.</div>
      ${gapBlocks}
    </div>

    <!-- Technical signals -->
    <div class="demo-two-col" style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:48px">
      <div>
        <div class="label" style="margin-bottom:4px">Technical Signals</div>
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Scanned every Monday. Green means you're covered. Warnings feed directly into your <a href="/demo/roadmap" style="color:var(--gold);text-decoration:none">roadmap</a>.</div>
        ${signalRows}
      </div>
      <div>
        <div class="label" style="margin-bottom:4px">Schema Coverage</div>
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Schema tells AI engines what your business is, what you offer, and what customers think. Missing types are queued as roadmap items. <a href="/demo/roadmap" style="color:var(--gold);text-decoration:none">See your fix plan</a></div>
        ${schemaRows}
      </div>
    </div>

    <!-- Red flags -->
    ${redFlags.length > 0 ? `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px;color:var(--red)">${redFlags.length} Red Flag${redFlags.length !== 1 ? 's' : ''}</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Issues actively hurting your score. Each one is mapped to a roadmap item with a fix. <a href="/demo/roadmap" style="color:var(--gold);text-decoration:none">View roadmap</a></div>
      ${flagRows}
    </div>` : ''}

    <!-- Page scans -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Page-Level Schema Coverage</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">We scan every page individually and track coverage over time. Gaps here generate specific <a href="/demo/roadmap" style="color:var(--gold);text-decoration:none">roadmap items</a>.</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px 20px">
        ${pageRows}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Citations page
// ---------------------------------------------------------------------------

function renderCitationsPage(): string {
  // Share trend (reuse citation snapshot data)
  const latestCit = CITATION_SNAPSHOTS[CITATION_SNAPSHOTS.length - 1];
  const sharePct = (latestCit.citation_share * 100).toFixed(0);

  // Engine breakdown (fake)
  const engineData = [
    { name: "ChatGPT", queries: 8, citations: 4 },
    { name: "Perplexity", queries: 6, citations: 2 },
    { name: "Gemini", queries: 4, citations: 1 },
    { name: "Google AIO", queries: 2, citations: 0 },
  ];
  const engineRows = engineData.map(e => {
    const share = e.queries > 0 ? Math.round((e.citations / e.queries) * 100) : 0;
    return `<tr><td>${e.name}</td><td>${e.queries}</td><td>${e.citations}</td><td>${share}%</td></tr>`;
  }).join("");

  // Citation matrix
  const allEntities = ["Meridian Dental", ...CITATION_COMPETITORS];
  const matrixHeader = allEntities.map(e => `<th style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);padding:8px 12px;white-space:nowrap">${esc(e)}</th>`).join("");
  const matrixRows = CITATION_KEYWORDS.map(kw => {
    const data = CITATION_MATRIX[kw];
    if (!data) return "";
    const cells = data.map((cited, i) => {
      if (i === 0 && cited) return `<td style="padding:8px 12px;text-align:center"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--green)"></span></td>`;
      if (i === 0 && !cited) return `<td style="padding:8px 12px;text-align:center"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;border:2px solid var(--red)"></span></td>`;
      if (cited) return `<td style="padding:8px 12px;text-align:center"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--gold)"></span></td>`;
      return `<td style="padding:8px 12px;text-align:center"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:rgba(251,248,239,.06)"></span></td>`;
    }).join("");
    return `<tr><td style="padding:8px 12px;font-size:13px;color:var(--text);white-space:nowrap">${esc(kw)}</td>${cells}</tr>`;
  }).join("");

  return `
    <div style="margin-bottom:32px">
      <h2 style="font-family:var(--serif);font-size:clamp(20px,3vw,28px);font-weight:400;margin:0">Citation Tracking</h2>
      <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Meridian Dental -- ${CITATION_KEYWORDS.length} tracked keywords</div>
    </div>

    <!-- Summary -->
    <div class="demo-three-col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:48px">
      <div class="card" style="text-align:center">
        <div style="font-family:var(--mono);font-size:32px;color:var(--gold)">${sharePct}%</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Citation Share</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-family:var(--mono);font-size:32px;color:var(--text)">${latestCit.client_citations}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Queries Citing You</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-family:var(--mono);font-size:32px;color:var(--text)">${latestCit.total_queries}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Total Tracked</div>
      </div>
    </div>

    <!-- Engine breakdown -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">By AI Engine</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="text-align:left;padding:8px 0;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Engine</th>
            <th style="text-align:left;padding:8px 0;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Queries</th>
            <th style="text-align:left;padding:8px 0;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Citations</th>
            <th style="text-align:left;padding:8px 0;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Share</th>
          </tr>
        </thead>
        <tbody style="color:var(--text-soft)">${engineRows}</tbody>
      </table>
    </div>

    <!-- Citation matrix -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Competitor Citation Matrix</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Who gets cited for each keyword. Green = you are cited. Gold = competitor cited. Red outline = you are not cited (gap).</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:8px 12px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Keyword</th>
              ${matrixHeader}
            </tr>
          </thead>
          <tbody>${matrixRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Matrix insight -->
    <div style="font-size:12px;color:var(--text-faint);line-height:1.7;margin-bottom:32px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">Meridian Dental is cited for 4 of 8 tracked keywords. The biggest gaps are in service-specific queries: "dental implants cost," "teeth whitening professional," and "root canal procedure" are all going to competitors. These are high-intent keywords where a single pillar article with proper schema could flip the citation. Aspen Dental leads with citations on 5 keywords.</div>

    <!-- Legend -->
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:11px;color:var(--text-faint)">
      <div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--green)"></span> You are cited</div>
      <div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--gold)"></span> Competitor cited</div>
      <div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;border:2px solid var(--red)"></span> Gap (not cited)</div>
      <div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(251,248,239,.06)"></span> Not cited</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Roadmap page
// ---------------------------------------------------------------------------

function renderRoadmapPage(): string {
  const allItems = ROADMAP_ITEMS;
  const totalItems = allItems.length;
  const totalDone = allItems.filter(i => i.status === "done").length;
  const overallPct = Math.round((totalDone / totalItems) * 100);

  // Phase journey
  const journeySteps = ROADMAP_PHASES.map(p => {
    const color = p.status === "completed" ? "var(--green)" : p.status === "active" ? "var(--gold)" : "var(--text-faint)";
    const bg = p.status === "completed" ? "var(--green)" : "transparent";
    const icon = p.status === "completed" ? '<span style="color:#080808;font-size:12px;font-weight:bold">&#10003;</span>' : `<span style="color:${color}">${p.phase_number}</span>`;
    return `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:28px;height:28px;border-radius:50%;${p.status === 'completed' ? 'background:var(--green);' : `border:2px solid ${color};`}display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:11px;flex-shrink:0">${icon}</div>
        <div>
          <div style="font-size:13px;color:${color}">${esc(p.title)}</div>
          <div style="font-size:10px;color:var(--text-faint)">${esc(p.subtitle || '')}</div>
        </div>
      </div>`;
  }).join('<div style="width:40px;height:1px;background:var(--line);margin:0 8px"></div>');

  // Build phase sections
  let phaseSections = "";
  for (const phase of ROADMAP_PHASES) {
    const phaseItems = allItems.filter(i => i.phase_id === phase.id);
    const phaseDone = phaseItems.filter(i => i.status === "done").length;
    const phaseInProg = phaseItems.filter(i => i.status === "in_progress").length;
    const phasePct = phaseItems.length > 0 ? Math.round((phaseDone / phaseItems.length) * 100) : 0;

    if (phase.status === "completed") {
      const completedDate = phase.completed_at ? shortDate(phase.completed_at) : "";
      phaseSections += `
        <div class="card" style="margin-bottom:16px;opacity:.7">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:14px;color:#080808;flex-shrink:0">&#10003;</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle || '')}</div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--green)">Completed</div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${completedDate}</div>
              <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${phaseDone} items delivered</div>
            </div>
          </div>
        </div>`;
    } else if (phase.status === "active") {
      const itemRows = phaseItems.map(item => {
        const statusColor = item.status === "done" ? "var(--green)" : item.status === "in_progress" ? "var(--yellow)" : "var(--text-faint)";
        const statusLabel = item.status === "done" ? "Done" : item.status === "in_progress" ? "In Progress" : "Pending";
        const catLabel = item.category.charAt(0).toUpperCase() + item.category.slice(1);
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(251,248,239,.06)">
            <div style="width:10px;height:10px;border-radius:2px;${item.status === 'done' ? 'background:var(--green)' : item.status === 'in_progress' ? 'background:var(--yellow)' : 'border:1.5px solid var(--text-faint)'};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;color:${item.status === 'done' ? 'var(--text-faint)' : 'var(--text)'};${item.status === 'done' ? 'text-decoration:line-through' : ''}">${esc(item.title)}</div>
              <div style="font-size:10px;color:var(--text-faint);margin-top:2px">${esc(catLabel)}</div>
            </div>
            <span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${statusColor}">${statusLabel}</span>
          </div>`;
      }).join("");

      phaseSections += `
        <div class="card" style="margin-bottom:16px;border:1px solid var(--gold-dim)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:12px;font-weight:600;color:var(--gold);flex-shrink:0">${phase.phase_number}</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle || '')}</div>
              </div>
            </div>
            <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:var(--gold-wash);padding:4px 12px;border-radius:2px">Active</span>
          </div>
          <div style="font-size:13px;color:var(--text-faint);line-height:1.7;margin-bottom:24px;padding:16px 20px;background:var(--bg-edge);border-radius:4px">${esc(phase.description || '')}</div>
          <div style="margin-bottom:28px">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">
              <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">Phase progress</div>
              <div style="font-size:13px;color:var(--text-faint)">${phaseDone} of ${phaseItems.length} complete (${phasePct}%)</div>
            </div>
            <div style="height:8px;background:rgba(251,248,239,.06);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${phasePct}%;background:var(--gold);border-radius:4px"></div>
            </div>
            <div style="display:flex;gap:20px;margin-top:10px;font-size:12px">
              <span style="color:var(--green)">${phaseDone} done</span>
              <span style="color:var(--yellow)">${phaseInProg} in progress</span>
              <span style="color:var(--text-faint)">${phaseItems.length - phaseDone - phaseInProg} pending</span>
            </div>
          </div>
          ${itemRows}
        </div>`;
    } else {
      // Locked
      phaseSections += `
        <div class="card" style="margin-bottom:16px;opacity:.45">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:12px;color:var(--text-faint);flex-shrink:0">${phase.phase_number}</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text-mute)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle || '')}</div>
              </div>
            </div>
            <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">Locked</span>
          </div>
          <div style="font-size:13px;color:var(--text-faint);line-height:1.7;margin-top:16px">${esc(phase.description || '')}</div>
        </div>`;
    }
  }

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px">
      <div>
        <h2 style="font-family:var(--serif);font-size:clamp(20px,3vw,28px);font-weight:400;margin:0">AEO Roadmap</h2>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Meridian Dental -- ${totalItems} items across ${ROADMAP_PHASES.length} phases</div>
      </div>
    </div>

    <!-- Roadmap narrative -->
    <div style="margin-bottom:32px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;font-size:13px;color:var(--text-soft);line-height:1.7">The roadmap is ${overallPct}% complete with ${totalDone} of ${totalItems} items delivered. Phase 1 (Foundation) is finished. Phase 2 (Growth) is active with 3 items in progress and 4 pending. The most impactful remaining work is deploying AggregateRating and Review schema, which directly affects how AI engines assess credibility. AEO improvements take 2-4 weeks to reflect in AI model responses, so results from recently completed items may not show in scores yet.</div>

    <!-- Overall progress -->
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="label">Overall Progress</div>
        <span style="font-family:var(--mono);font-size:14px;color:var(--gold)">${overallPct}%</span>
      </div>
      <div style="height:10px;background:rgba(251,248,239,.06);border-radius:5px;overflow:hidden;margin-bottom:16px">
        <div style="height:100%;width:${overallPct}%;background:var(--gold);border-radius:5px"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap">
        ${journeySteps}
      </div>
    </div>

    <!-- Phase sections -->
    ${phaseSections}
  `;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export function handleDemoRedirect(): Response {
  return demoRedirect("/demo/domain");
}

export function handleDemoDomain(): Response {
  return demoHtml(demoLayout("Dashboard", renderDomainPage(), "domain"));
}

export function handleDemoCitations(): Response {
  return demoHtml(demoLayout("Citations", renderCitationsPage(), "citations"));
}

export function handleDemoRoadmap(): Response {
  return demoHtml(demoLayout("Roadmap", renderRoadmapPage(), "roadmap"));
}

export function handleDemoPost(): Response {
  return demoHtml(demoLayout("Demo Mode", `
    <div style="text-align:center;padding:80px 20px">
      <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--gold);margin-bottom:16px">Editing is disabled in demo mode</div>
      <div style="font-size:14px;color:var(--text-faint);margin-bottom:32px">This is a read-only preview. Start with the $500 audit to get your own dashboard with live data.</div>
      <a href="https://app.neverranked.com/checkout/audit" style="display:inline-block;padding:14px 32px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:12px;font-weight:500;text-decoration:none;border-radius:4px">Start with the $500 audit</a>
    </div>
  `, "domain"), 403);
}

/**
 * NVI report HTML template.
 *
 * Renders an nvi_reports row + supporting data into a fully styled
 * HTML document. The document is designed to be:
 *   1. Readable as a web page (admin preview at /admin/nvi/preview/:id)
 *   2. Rendered to PDF by Cloudflare Browser Rendering (production
 *      delivery to clients) -- @media print rules below switch to a
 *      print-friendly light theme automatically
 *
 * Mirrors the design system established in pitch/blue-note-hawaii/
 * and pitch/ellen/ -- same fonts (Playfair / DM Mono / Barlow
 * Condensed), same gold accent (#e8c767), same structural rhythm
 * with numbered sections and the off-white-on-near-black palette.
 *
 * All CSS is inlined so the rendered PDF doesn't depend on external
 * stylesheets at print time.
 */
import type { Env } from "../types";
import { gradeBand } from "../../../packages/aeo-analyzer/src/grade-bands";

export interface NviReportRow {
  id: number;
  client_slug: string;
  reporting_period: string;
  tier: string;
  ai_presence_score: number;
  prev_score: number | null;
  prompts_evaluated: number;
  citations_found: number;
  insight: string;
  action: string;
}

export interface EngineBreakdown {
  engine: string;
  display_name: string;
  prompts_cited: number;
  prompts_total: number;
}

export interface PromptResult {
  keyword: string;
  cited_in_engines: string[];
  competitors_cited: string[];
}

export interface ReportContext {
  report: NviReportRow;
  client_name: string;             // human-readable, e.g. "Hawaii Theatre Center"
  engine_breakdown: EngineBreakdown[];
  top_prompts_cited: PromptResult[];
  top_prompts_missed: PromptResult[];
  aeo_readiness_score: number | null; // from latest scan_results, for cross-ref
}

export function buildNviReportHtml(ctx: ReportContext): string {
  const { report, client_name } = ctx;
  const band = gradeBand(report.ai_presence_score);
  const period = formatPeriod(report.reporting_period);
  const delta = report.prev_score !== null
    ? report.ai_presence_score - report.prev_score
    : null;
  const deltaStr = delta === null
    ? "First report"
    : delta > 0
      ? `+${delta} pts since last month`
      : delta < 0
        ? `${delta} pts since last month`
        : "no change";
  const deltaColor = delta === null ? "var(--text-faint)"
    : delta > 0 ? "var(--green)"
    : delta < 0 ? "var(--red)"
    : "var(--text-faint)";

  const aeoNote = ctx.aeo_readiness_score !== null
    ? buildAeoCrossRef(report.ai_presence_score, ctx.aeo_readiness_score)
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NVI Report ${esc(period)} — ${esc(client_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0a0a;
  --bg-lift:#161616;
  --bg-edge:#1f1f1f;
  --gold:#e8c767;
  --gold-dim:#c9a84c;
  --text:#f0ece3;
  --text-soft:rgba(240,236,227,.96);
  --text-mute:rgba(240,236,227,.82);
  --text-faint:rgba(240,236,227,.6);
  --line:rgba(240,236,227,.18);
  --green:#4ade80;
  --red:#ef4444;
  --serif:"Playfair Display",Georgia,serif;
  --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --label:"Barlow Condensed","Arial Narrow",sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--mono);
  font-size:13px;
  line-height:1.65;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
.page{max-width:780px;margin:0 auto;padding:48px 56px}
.eyebrow{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.22em;
  font-size:10px;color:var(--text-faint);margin-bottom:18px;
}
h1{
  font-family:var(--serif);font-weight:400;font-size:36px;line-height:1.15;
  letter-spacing:-.01em;margin:0 0 8px;
}
h2{
  font-family:var(--serif);font-weight:400;font-size:24px;line-height:1.2;
  letter-spacing:-.01em;margin:0 0 14px;
}
h3{
  font-family:var(--serif);font-weight:500;font-size:16px;line-height:1.3;
  letter-spacing:-.005em;margin:0 0 8px;
}
p{margin:0 0 14px;color:var(--text-soft);max-width:62ch}
.section-label{
  display:flex;align-items:center;gap:14px;
  font-family:var(--label);text-transform:uppercase;letter-spacing:.22em;
  font-size:10px;color:var(--text-mute);margin-bottom:24px;
}
.section-label .num{color:var(--gold);font-weight:500}
.section-label .rule{flex:1;height:1px;background:var(--line)}
.section{padding:36px 0;border-bottom:1px solid var(--line)}
.section:last-child{border-bottom:none}

/* Hero score */
.score-hero{
  display:flex;align-items:flex-start;justify-content:space-between;gap:32px;
  padding:48px 0 36px;border-bottom:1px solid var(--line);
}
.score-hero .left{flex:1}
.score-meta{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:10px;color:var(--text-faint);margin-bottom:12px;
}
.score-headline{
  font-family:var(--serif);font-weight:400;font-size:32px;line-height:1.2;
  letter-spacing:-.01em;margin:0 0 12px;
}
.score-band-tag{
  display:inline-block;font-family:var(--label);text-transform:uppercase;
  letter-spacing:.16em;font-size:10px;padding:4px 10px;border-radius:2px;
}
.score-number{
  font-family:var(--serif);font-style:italic;font-size:96px;line-height:1;
  font-weight:400;color:var(--gold);letter-spacing:-.02em;text-align:right;
  min-width:140px;
}
.score-grade{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:11px;color:var(--text-faint);margin-top:6px;text-align:right;
}
.score-delta{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:10px;margin-top:14px;text-align:right;
}

/* Engine breakdown table */
.engine-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
.engine-table th{
  text-align:left;padding:10px 12px;font-family:var(--label);
  text-transform:uppercase;letter-spacing:.14em;font-size:10px;
  color:var(--text-mute);border-bottom:1px solid var(--line);font-weight:500;
}
.engine-table td{
  padding:12px;border-bottom:1px solid var(--line);color:var(--text-soft);
}
.engine-table tr:last-child td{border-bottom:none}
.engine-table .bar-cell{width:35%}
.engine-bar{
  display:inline-block;height:6px;background:var(--bg-edge);border-radius:2px;
  width:100%;overflow:hidden;vertical-align:middle;
}
.engine-bar > span{display:block;height:100%;background:var(--gold)}

/* Prompt list */
.prompt-list{list-style:none;padding:0;margin:0}
.prompt-list li{
  padding:14px 0;border-bottom:1px solid var(--line);
  display:flex;align-items:center;gap:16px;
}
.prompt-list li:last-child{border-bottom:none}
.prompt-list .text{flex:1;color:var(--text-soft);font-size:13px}
.prompt-list .meta{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;
  font-size:10px;color:var(--text-faint);white-space:nowrap;
}
.prompt-list .meta.ok{color:var(--green)}
.prompt-list .meta.miss{color:var(--text-faint)}

/* Insight + action callout */
.callout{
  padding:24px 28px;background:var(--bg-lift);border-left:2px solid var(--gold);
  border-radius:0 4px 4px 0;margin:8px 0 24px;
}
.callout .label{
  font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;
  font-size:10px;color:var(--gold);margin-bottom:10px;
}
.callout p{margin:0;color:var(--text)}

/* Footer */
.footer{
  padding:32px 0 0;font-family:var(--label);text-transform:uppercase;
  letter-spacing:.18em;font-size:9px;color:var(--text-faint);
}
.footer .meta{margin-bottom:8px}
.footer .meta strong{color:var(--text-mute);font-weight:500}

/* Print: switch to a light theme so paper output is legible.
   Uses overrides on the CSS custom properties themselves so any
   element using var(--text-*) automatically picks up the dark
   color in print mode -- much more robust than per-element rules.
   This is the trick that catches inline-styled callout boxes
   without listing every selector. */
@media print{
  :root{
    --bg:#fff;
    --bg-lift:#fafaf5;
    --bg-edge:#f0ede4;
    --text:#0a0a0a;
    --text-soft:#1a1a1a;
    --text-mute:#3a3a3a;
    --text-faint:#5a5a5a;
    --line:#d4d0c4;
    --gold:#9c7a1f;
    --gold-dim:#8c6c1c;
    --green:#2d8b3a;
    --red:#c14a3a;
  }
  body{background:#fff !important;color:#0a0a0a !important;font-size:10pt}
  .page{padding:0.5in;max-width:none}
  h1,h2,h3{color:#0a0a0a !important}
  /* Callout backgrounds are intentionally pale-tinted in dark mode
     (rgba); on white paper they nearly disappear. Force a slightly
     stronger tint for print so the green/yellow/red callouts read. */
  div[style*="background:rgba(74,222,128"]{background:#eaf6ec !important}
  div[style*="background:rgba(239,68,68"]{background:#fceeec !important}
  div[style*="background:var(--bg-lift)"]{background:#fafaf5 !important}
  /* Engine bar fill -- gold reads better on light than the dark-mode
     yellow gold against white. */
  .engine-bar > span{background:#9c7a1f !important}
  .engine-bar{background:#eaeaea !important}
  /* Footer inline-styled border -- override to print-friendly grey. */
  .footer{color:#5a5a5a !important;border-top-color:#d4d0c4 !important}
}
</style>
</head>
<body>
<div class="page">

  <!-- HERO -->
  <div class="score-hero">
    <div class="left">
      <div class="score-meta">Neverranked Visibility Index &middot; ${esc(period)} &middot; ${esc(report.tier.toUpperCase())}</div>
      <h1 class="score-headline">${esc(client_name)}</h1>
      <span class="score-band-tag" style="border:1px solid ${band.color};color:${band.color}">${esc(band.label)}</span>
    </div>
    <div>
      <div class="score-number">${report.ai_presence_score}</div>
      <div class="score-grade">Grade ${esc(band.grade)} &middot; AI Presence Score</div>
      <div class="score-delta" style="color:${deltaColor}">${esc(deltaStr)}</div>
    </div>
  </div>

  ${aeoNote}

  <!-- 01 ENGINE BREAKDOWN -->
  <section class="section">
    <div class="section-label"><span class="num">01</span><span>Engine breakdown</span><span class="rule"></span></div>
    <p>Where you appeared this month across the AI engines we track. Citations measured across ${report.prompts_evaluated} tracked prompts, the prompt set you approved at onboarding.</p>
    <table class="engine-table">
      <thead>
        <tr><th>Engine</th><th>Cited in</th><th class="bar-cell">Coverage</th><th>%</th></tr>
      </thead>
      <tbody>
        ${ctx.engine_breakdown.map((e) => {
          const pct = e.prompts_total > 0 ? Math.round((e.prompts_cited / e.prompts_total) * 100) : 0;
          return `
            <tr>
              <td><strong style="color:var(--text)">${esc(e.display_name)}</strong></td>
              <td>${e.prompts_cited} / ${e.prompts_total}</td>
              <td class="bar-cell"><span class="engine-bar"><span style="width:${pct}%"></span></span></td>
              <td>${pct}%</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  </section>

  <!-- 02 WHERE YOU SHOWED UP -->
  <section class="section">
    <div class="section-label"><span class="num">02</span><span>Where you showed up</span><span class="rule"></span></div>
    <p>The prompts where AI engines named you this month. These are the queries that are working in your favor.</p>
    ${ctx.top_prompts_cited.length === 0
      ? `<p style="color:var(--text-faint)">No prompts surfaced citations this month. The "where you didn't" list below is the priority.</p>`
      : `<ul class="prompt-list">
          ${ctx.top_prompts_cited.slice(0, 5).map((p) => `
            <li>
              <span class="text">"${esc(p.keyword)}"</span>
              <span class="meta ok">${p.cited_in_engines.length}/${ctx.engine_breakdown.length} engines</span>
            </li>`).join("")}
        </ul>`}
  </section>

  <!-- 03 WHERE YOU DIDN'T -->
  <section class="section">
    <div class="section-label"><span class="num">03</span><span>Where you didn't</span><span class="rule"></span></div>
    <p>The prompts where AI engines did not surface you. These are the gaps. The action item below addresses the highest-leverage one.</p>
    ${ctx.top_prompts_missed.length === 0
      ? `<p style="color:var(--green)">Every tracked prompt surfaced you in at least one engine. Defense mode.</p>`
      : `<ul class="prompt-list">
          ${ctx.top_prompts_missed.slice(0, 5).map((p) => `
            <li>
              <span class="text">"${esc(p.keyword)}"</span>
              <span class="meta miss">${p.competitors_cited.length > 0 ? esc(`competitor: ${p.competitors_cited[0]}`) : "no one"}</span>
            </li>`).join("")}
        </ul>`}
  </section>

  <!-- 04 INSIGHT -->
  <section class="section">
    <div class="section-label"><span class="num">04</span><span>What this means</span><span class="rule"></span></div>
    <div class="callout">
      <div class="label">Insight</div>
      <p>${esc(report.insight)}</p>
    </div>
    <div class="callout">
      <div class="label">Recommended action this month</div>
      <p>${esc(report.action)}</p>
    </div>
  </section>

  <!-- FOOTER -->
  <div class="footer">
    <div class="meta"><strong>Methodology.</strong> ${report.prompts_evaluated} prompts queried across ChatGPT, Perplexity, Gemini, and Google AI Overviews. Citation share computed as % of prompts where the client name or domain appears in the engine's response. AI Presence Score weights: citation rate (50), engine spread (30), sentiment (20). Sample size disciplined: percentages hidden below n=10 mentions.</div>
    <div class="meta"><strong>Reporting period.</strong> ${esc(period)} &middot; UTC month boundaries.</div>
    <div class="meta"><strong>Generated by.</strong> Neverranked Visibility Index &middot; neverranked.com</div>
  </div>

</div>
</body>
</html>`;
}

function buildAeoCrossRef(presence: number, readiness: number): string {
  const diff = readiness - presence;
  if (Math.abs(diff) < 10) return "";
  if (diff >= 20) {
    return `
    <div style="padding:18px 24px;background:rgba(74,222,128,.06);border-left:2px solid var(--green);border-radius:0 4px 4px 0;margin:24px 0 0">
      <div style="font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:10px;color:var(--green);margin-bottom:6px">Cross-system note</div>
      <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6">Your AEO Readiness Score is ${readiness}/100, ${diff} points above your AI Presence. That's normal lag. Recent structural improvements have not been absorbed by AI engines yet (typical window: 60-90 days). Momentum is good.</div>
    </div>`;
  }
  if (diff <= -10) {
    return `
    <div style="padding:18px 24px;background:rgba(239,68,68,.06);border-left:2px solid var(--red);border-radius:0 4px 4px 0;margin:24px 0 0">
      <div style="font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:10px;color:var(--red);margin-bottom:6px">Cross-system alert</div>
      <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6">Your AI Presence (${presence}) is outpacing your AEO Readiness (${readiness}). You are earning citations on past structure, but the foundation is slipping. Worth reinforcing the schema layer before citations follow.</div>
    </div>`;
  }
  return "";
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build a ReportContext from DB rows. The runner calls this; the
 *  preview route also calls it for the most-recent report on a slug. */
export async function loadReportContext(env: Env, reportId: number): Promise<ReportContext | null> {
  const report = await env.DB.prepare(
    "SELECT * FROM nvi_reports WHERE id = ?"
  ).bind(reportId).first<NviReportRow>();
  if (!report) return null;

  // Resolve a human-readable client name. Use injection_configs.business_name
  // if set, else fall back to a prettified slug.
  const cfg = await env.DB.prepare(
    "SELECT business_name FROM injection_configs WHERE client_slug = ?"
  ).bind(report.client_slug).first<{ business_name: string | null }>();
  const client_name = cfg?.business_name || prettifySlug(report.client_slug);

  // Engine breakdown for the period
  const [year, month] = report.reporting_period.split("-").map(Number);
  const periodStart = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const periodEnd = Math.floor(Date.UTC(year, month, 1) / 1000);

  const engineRows = (await env.DB.prepare(
    `SELECT engine,
            COUNT(DISTINCT keyword_id) AS prompts_total,
            SUM(CASE WHEN client_cited = 1 THEN 1 ELSE 0 END) AS prompts_cited
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
       GROUP BY engine
       ORDER BY engine`
  ).bind(report.client_slug, periodStart, periodEnd)
   .all<{ engine: string; prompts_total: number; prompts_cited: number }>()).results;

  const engine_breakdown: EngineBreakdown[] = engineRows.map((r) => ({
    engine: r.engine,
    display_name: ENGINE_DISPLAY[r.engine] || r.engine,
    prompts_cited: r.prompts_cited,
    prompts_total: r.prompts_total,
  }));

  // Prompts where the client was cited in at least one engine
  const citedPromptRows = (await env.DB.prepare(
    `SELECT ck.keyword,
            GROUP_CONCAT(DISTINCT cr.engine) AS engines
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
         AND cr.client_cited = 1
       GROUP BY ck.keyword
       ORDER BY COUNT(*) DESC
       LIMIT 10`
  ).bind(report.client_slug, periodStart, periodEnd)
   .all<{ keyword: string; engines: string }>()).results;
  const top_prompts_cited: PromptResult[] = citedPromptRows.map((r) => ({
    keyword: r.keyword,
    cited_in_engines: (r.engines || "").split(","),
    competitors_cited: [],
  }));

  // Prompts where the client was NOT cited in ANY engine. Get all
  // tracked keywords for the client and subtract the cited set.
  const allKeywordsRows = (await env.DB.prepare(
    `SELECT keyword FROM citation_keywords WHERE client_slug = ? ORDER BY keyword`
  ).bind(report.client_slug).all<{ keyword: string }>()).results;
  const citedSet = new Set(citedPromptRows.map((r) => r.keyword));
  const top_prompts_missed: PromptResult[] = allKeywordsRows
    .filter((r) => !citedSet.has(r.keyword))
    .slice(0, 10)
    .map((r) => ({ keyword: r.keyword, cited_in_engines: [], competitors_cited: [] }));

  // AEO Readiness from latest scan
  const scanRow = await env.DB.prepare(
    `SELECT sr.aeo_score
       FROM scan_results sr
       JOIN domains d ON d.id = sr.domain_id
       WHERE d.client_slug = ? AND d.is_competitor = 0 AND d.active = 1
       ORDER BY sr.scanned_at DESC LIMIT 1`
  ).bind(report.client_slug).first<{ aeo_score: number }>();

  return {
    report,
    client_name,
    engine_breakdown,
    top_prompts_cited,
    top_prompts_missed,
    aeo_readiness_score: scanRow?.aeo_score ?? null,
  };
}

const ENGINE_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_ai_overview: "Google AI Overviews",
  anthropic: "Claude",
};

function prettifySlug(slug: string): string {
  return slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

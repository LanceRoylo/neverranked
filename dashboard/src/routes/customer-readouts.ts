/**
 * Customer readout archive — /c/<slug>/readouts[/<YYYY-MM>]
 *
 * The permanent, browsable history of a customer's monthly reports. Each
 * delivered monthly_memos row is one report, frozen at delivery. A report
 * selector (dropdown) in the header lists every delivered report by number +
 * month; selecting one navigates to that report's own permanent URL, so every
 * report is bookmarkable and nothing is ever overwritten.
 *
 * Why this exists: before this, a customer could only ever see the single
 * latest readout (the pitch page overwrote on each refresh; delivered memos had
 * no customer-facing surface at all). Reports are meant to be immutable dated
 * artifacts — the same frozen-snapshot discipline as the teardowns.
 *
 * - Permalink is the month_key (stable forever). The report NUMBER is a derived
 *   display label (chronological position among delivered reports), so a bookmark
 *   keeps working even if an earlier month is backfilled later.
 * - Only DELIVERED reports are visible (delivered_at IS NOT NULL); drafts stay in
 *   /admin/memos.
 * - Auth is identical to the cockpit: admin, or the customer's own client_slug.
 */
import type { Env } from "../types";
import { getUser } from "../auth";
import { redirect, esc } from "../render";

interface ReportRow {
  month_key: string; // 'YYYY-MM'
  title: string | null;
  body_markdown: string;
  delivered_at: number;
  facts_json: string | null; // frozen chart data for this report (null = narrative-only)
}

function userCanView(user: { role?: string; client_slug?: string }, slug: string): boolean {
  if (user.role === "admin") return true;
  if (user.client_slug === slug) return true;
  return false;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'YYYY-MM' -> 'Jul 2026' (parsed directly; no Date/timezone drift). */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTHS[m - 1]} ${y}`;
}

/** Two-digit report number from a 1-based index. */
function reportNo(i: number): string {
  return String(i + 1).padStart(2, "0");
}

/**
 * Minimal, SAFE markdown -> HTML for report bodies. Escapes all HTML first,
 * then applies a fixed, closed set of transforms. Crucially, link hrefs are
 * scheme-validated (http/https/mailto only) — a report body can contain
 * competitor names lifted from AI-engine output (attacker-influenceable), so a
 * `javascript:`/`data:` href must never survive. No raw HTML passthrough.
 */
export function renderReportMarkdown(md: string): string {
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeHref = (url: string): string | null => {
    const u = url.trim();
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
    if (u.startsWith("/")) return u; // internal relative link
    return null;
  };
  const inline = (s: string) =>
    escHtml(s)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
        const href = safeHref(url);
        return href
          ? `<a href="${href.replace(/"/g, "&quot;")}" rel="noopener noreferrer nofollow"${href.startsWith("/") ? "" : ' target="_blank"'}>${text}</a>`
          : text; // drop unsafe-scheme links, keep the text
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  const flushUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  const isTableSep = (s: string) => /^\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(s.trim());
  const cells = (s: string) => s.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { flushUl(); continue; }
    // GFM table: a header row immediately followed by a |---|---| separator.
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushUl();
      const header = cells(line);
      const rows: string[][] = [];
      i += 2; // consume header + separator
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trim())) { rows.push(cells(lines[i])); i++; }
      i--; // step back so the loop's i++ lands on the following line
      const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/)))   { flushUl(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^##\s+(.*)$/)))  { flushUl(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^###\s+(.*)$/))) { flushUl(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^[*-]\s+(.*)$/))) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    flushUl();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushUl();
  return out.join("\n");
}

async function loadDeliveredReports(env: Env, slug: string): Promise<ReportRow[]> {
  return (await env.DB.prepare(
    `SELECT month_key, title, body_markdown, delivered_at, facts_json
       FROM monthly_memos
      WHERE client_slug = ? AND delivered_at IS NOT NULL
      ORDER BY month_key ASC`,
  ).bind(slug).all<ReportRow>()).results;
}

// ── Charts ───────────────────────────────────────────────────────────
// Rendered from the report's FROZEN facts_json (never a live snapshot, which
// gets overwritten). Div-based horizontal bars: the fill animates via scaleX
// (transform only, 60fps), staggered, ease-out, with a prefers-reduced-motion
// fallback. Every chart carries a plain-language "How to read this" caption --
// the interpretation layer is the point. Fully defensive: bad/absent facts_json
// renders nothing (the report stays narrative-only).

interface ChartEngine { name: string; pct: number; prev?: number | null; }
interface ChartRow { label: string; pct: number; you?: boolean; own?: boolean; }
interface ReportFacts {
  period_label?: string;
  prior_label?: string;
  engines?: ChartEngine[];
  venue?: { rows?: ChartRow[] };
  sources?: ChartRow[];
  topSources?: { host: string; pct: number }[]; // specific third-party domains AI cited
}

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** One horizontal bar row. width is relative to the chart's max so small values stay visible. */
function barRow(label: string, pct: number, maxPct: number, i: number, opts: { hl?: boolean; delta?: number | null; title?: string; labelHtml?: string } = {}): string {
  const w = Math.max(2, Math.min(100, Math.round((pct / Math.max(1, maxPct)) * 100)));
  let pill = "";
  if (typeof opts.delta === "number") {
    const d = opts.delta;
    const cls = d > 0 ? "up" : d < 0 ? "down" : "even";
    const txt = d > 0 ? `+${d}` : d < 0 ? `${d}` : "even";
    pill = ` <span class="nr-d ${cls}">${txt}</span>`;
  }
  const t = opts.title ? ` title="${esc(opts.title)}"` : "";
  // opts.labelHtml is a pre-built, already-safe label (e.g. a validated link);
  // otherwise the plain label is escaped.
  return `<div class="nr-row" style="--i:${i}"${t}>
    <div class="nr-lab">${opts.labelHtml ?? esc(label)}</div>
    <div class="nr-track"><div class="nr-fill${opts.hl ? " nr-hl" : ""}" style="width:${w}%"></div></div>
    <div class="nr-val">${num(pct)}%${pill}</div>
  </div>`;
}

function chartBlock(title: string, bars: string, caption: string): string {
  return `<section class="nr-chart"><h3 class="nr-ctitle">${esc(title)}</h3><div class="nr-bars">${bars}</div><p class="nr-cap"><strong>How to read this.</strong> ${caption}</p></section>`;
}

export function renderCharts(factsJson: string | null): string {
  if (!factsJson) return "";
  let f: ReportFacts;
  try { f = JSON.parse(factsJson) as ReportFacts; } catch { return ""; }
  if (!f || typeof f !== "object") return "";
  const prior = f.prior_label ? esc(f.prior_label) : "last month";
  const blocks: string[] = [];

  // 1. Per-engine citation share (with month-over-month delta pills).
  const engines = Array.isArray(f.engines) ? f.engines.filter((e) => e && typeof e.name === "string") : [];
  if (engines.length) {
    const sorted = [...engines].sort((a, b) => num(b.pct) - num(a.pct));
    const max = Math.max(...sorted.map((e) => num(e.pct)), 1);
    const bars = sorted.map((e, i) => {
      const delta = typeof e.prev === "number" ? num(e.pct) - num(e.prev) : null;
      const title = delta === null
        ? `${e.name}: ${num(e.pct)}% of its citations point to you`
        : `${e.name}: ${num(e.pct)}% this period, ${delta >= 0 ? "up" : "down"} from ${num(e.prev)}%`;
      return barRow(e.name, num(e.pct), max, i, { delta, title });
    }).join("");
    const cap = `Each bar is the share of that AI tool's citations that point to your own site. Higher is better. The pill shows the change since ${prior}.`;
    blocks.push(chartBlock("Where each AI tool cites you", bars, cap));
  }

  // 2. Venue-share ranking (you highlighted).
  const vrows = f.venue && Array.isArray(f.venue.rows) ? f.venue.rows.filter((r) => r && typeof r.label === "string") : [];
  if (vrows.length) {
    const max = Math.max(...vrows.map((r) => num(r.pct)), 1);
    const bars = vrows.map((r, i) => barRow(r.label, num(r.pct), max, i, { hl: !!r.you, title: `${r.label}: ${num(r.pct)}% of venue citations` })).join("");
    const cap = `Of every mention the AI tools made of a venue in your category, this is who got named. Your bar is highlighted.`;
    blocks.push(chartBlock("Who AI names in your category", bars, cap));
  }

  // 3. Where the answers come from (source types; your own site highlighted).
  const sources = Array.isArray(f.sources) ? f.sources.filter((r) => r && typeof r.label === "string") : [];
  if (sources.length) {
    const max = Math.max(...sources.map((r) => num(r.pct)), 1);
    const bars = sources.map((r, i) => barRow(r.label, num(r.pct), max, i, { hl: !!r.own, title: `${r.label}: ${num(r.pct)}% of cited sources` })).join("");
    const cap = `Where the AI tools pulled the information behind their answers. Most is the independent web, not anyone's own website, which is why off-site presence matters as much as your own site.`;
    blocks.push(chartBlock("Where AI's answers come from", bars, cap));
  }

  // 4. The specific third-party sites AI cited (answers "which ones?" for the
  // buckets above). Each host is a clickable link — the off-site punch list.
  const topSources = Array.isArray(f.topSources) ? f.topSources.filter((r) => r && typeof r.host === "string") : [];
  if (topSources.length) {
    const max = Math.max(...topSources.map((r) => num(r.pct)), 1);
    const bars = topSources.map((r, i) => {
      const host = String(r.host);
      // Only link plain, well-formed hostnames (defensive: no scheme/path/space
      // ever reaches the href, so a measured string can't smuggle a bad URL).
      const isHost = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host);
      const labelHtml = isHost
        ? `<a href="https://${host}" target="_blank" rel="noopener noreferrer nofollow">${esc(host)}</a>`
        : esc(host);
      return barRow(host, num(r.pct), max, i, { labelHtml, title: `${host}: ${num(r.pct)}% of cited sources` });
    }).join("");
    const cap = `Each percent is that site's share of every source the AI tools cited in your category, the same base as the chart above, so these are the biggest individual names inside the independent web. They are the off-site places to get listed and accurate. This is the top of a long tail, not the full picture, and each is a domain, not a single page.`;
    blocks.push(chartBlock("The specific sites AI pulls from", bars, cap));
  }

  if (!blocks.length) return "";
  const heading = f.period_label ? `By the numbers &middot; ${esc(f.period_label)}` : "By the numbers";
  return `<div class="nrcharts"><div class="nr-h">${heading}</div>${blocks.join("")}</div>`;
}

function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0b0c; color:#e8e8ea; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 24px 96px; }
  .top { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding-bottom:20px; border-bottom:1px solid #26241f; margin-bottom:36px; }
  .top a.back { color:#8a857a; text-decoration:none; font-size:14px; }
  .top a.back:hover { color:#d4c596; }
  .sel label { display:block; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  select { background:#151512; color:#e8e8ea; border:1px solid #38352d; border-radius:8px; padding:9px 12px; font-size:14px; min-width:220px; }
  select:hover { border-color:#d4c596; }
  .meta { font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  h1.report-title { font-weight:400; font-size:26px; margin:0 0 28px; letter-spacing:-.01em; }
  .body h2 { font-weight:500; font-size:20px; margin:34px 0 12px; color:#f2efe6; }
  .body h3 { font-weight:600; font-size:15px; letter-spacing:.02em; text-transform:uppercase; color:#b7b1a3; margin:26px 0 8px; }
  .body p { margin:0 0 14px; color:#dcd8d0; }
  .body ul { margin:0 0 16px; padding-left:22px; }
  .body li { margin:0 0 7px; color:#dcd8d0; }
  .body a { color:#d4c596; }
  .body code { background:#1a1916; padding:1px 5px; border-radius:4px; font-size:13px; }
  .body table { width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; font-variant-numeric:tabular-nums; }
  .body th { text-align:left; font-weight:500; color:#b7b1a3; letter-spacing:.03em; text-transform:uppercase; font-size:11px; padding:8px 14px 8px 0; border-bottom:1px solid #38352d; }
  .body td { padding:8px 14px 8px 0; border-bottom:1px solid #211e18; color:#dcd8d0; }
  .body td:first-child { color:#e8e8ea; }
  .empty { color:#8a857a; padding:48px 0; text-align:center; }
  .foot { margin-top:56px; padding-top:20px; border-top:1px solid #26241f; font-size:13px; color:#6f6a60; }
  /* charts */
  .nrcharts { margin:4px 0 44px; }
  .nr-h { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#8a857a; margin:0 0 20px; padding-bottom:10px; border-bottom:1px solid #26241f; }
  .nr-chart { margin:0 0 32px; }
  .nr-ctitle { font-weight:500; font-size:16px; color:#f2efe6; margin:0 0 14px; }
  .nr-bars { display:flex; flex-direction:column; gap:9px; }
  .nr-row { display:grid; grid-template-columns:154px 1fr 92px; align-items:center; gap:12px; }
  .nr-lab { font-size:13px; color:#c9c4b8; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nr-track { height:20px; background:#17160f; border-radius:5px; overflow:hidden; }
  .nr-fill { height:100%; background:#5b563f; border-radius:5px; transform:scaleX(0); transform-origin:left; transition:transform .55s cubic-bezier(.23,1,.32,1); transition-delay:calc(var(--i) * 55ms); }
  .nr-fill.nr-hl { background:linear-gradient(90deg,#d4c596,#b79a53); }
  .nr-row:hover .nr-fill { filter:brightness(1.12); }
  .nr-val { font-size:13px; color:#e8e8ea; font-variant-numeric:tabular-nums; opacity:0; transition:opacity .4s ease; transition-delay:calc(var(--i) * 55ms + .15s); }
  .nrcharts.in .nr-fill { transform:scaleX(1); }
  .nrcharts.in .nr-val { opacity:1; }
  .nr-d { font-size:11px; padding:1px 5px; border-radius:4px; margin-left:5px; }
  .nr-d.up { color:#7bdca0; background:rgba(123,220,160,.12); }
  .nr-d.down { color:#e0a488; background:rgba(224,164,136,.12); }
  .nr-d.even { color:#8a857a; }
  .nr-cap { font-size:13px; color:#8a857a; margin:12px 0 0; line-height:1.55; }
  .nr-cap strong { color:#b7b1a3; }
  @media (max-width:560px){ .nr-row{ grid-template-columns:92px 1fr 70px; gap:8px; } .nr-lab{ font-size:12px; } }
  @media (prefers-reduced-motion:reduce){ .nr-fill{ transition:none; transform:scaleX(1); } .nr-val{ transition:none; opacity:1; } }
</style></head><body><div class="wrap">${inner}</div>
<script>
(function(){
  var c = document.querySelector('.nrcharts');
  if(!c) return;
  if(!('IntersectionObserver' in window)){ c.classList.add('in'); return; }
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ c.classList.add('in'); io.disconnect(); } });
  }, { threshold: 0.12 });
  io.observe(c);
})();
</script>
</body></html>`;
}

/** GET /c/<slug>/readouts — redirect to the latest report (or empty state). */
export async function handleReadoutsIndex(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/readouts`));
  if (!userCanView(user as any, slug)) return new Response("Forbidden", { status: 403 });

  const reports = await loadDeliveredReports(env, slug);
  if (reports.length === 0) {
    return new Response(shell("Reports", `
      <div class="top"><a class="back" href="/c/${esc(slug)}/">&larr; Back to dashboard</a></div>
      <div class="empty">Your reports will appear here.<br>The first one lands after your first monthly readout is delivered.</div>`),
      { status: 200, headers: { "content-type": "text/html;charset=utf-8" } });
  }
  const latest = reports[reports.length - 1];
  return redirect(`/c/${slug}/readouts/${latest.month_key}`);
}

/** GET /c/<slug>/readouts/<YYYY-MM> — one frozen report + the selector. */
export async function handleReadoutView(request: Request, env: Env, slug: string, monthKey: string): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/readouts/${monthKey}`));
  if (!userCanView(user as any, slug)) return new Response("Forbidden", { status: 403 });

  const reports = await loadDeliveredReports(env, slug);
  const idx = reports.findIndex((r) => r.month_key === monthKey);
  if (idx === -1) {
    // Unknown or undelivered month: send them to the latest instead of a bare 404.
    return handleReadoutsIndex(request, env, slug);
  }
  const r = reports[idx];

  // Dropdown: newest first, current selected. Value = month_key (the permalink).
  const options = reports
    .map((rep, i) => ({ ...rep, no: reportNo(i) }))
    .reverse()
    .map((rep) =>
      `<option value="${esc(rep.month_key)}"${rep.month_key === monthKey ? " selected" : ""}>Report ${rep.no} &middot; ${esc(monthLabel(rep.month_key))}</option>`,
    ).join("");

  const selector = reports.length > 1
    ? `<div class="sel"><label for="rpt">Report</label>
         <select id="rpt" onchange="if(this.value)location.href='/c/${esc(slug)}/readouts/'+this.value">${options}</select></div>`
    : "";

  const delivered = new Date(r.delivered_at * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const title = r.title || `${monthLabel(monthKey)} readout`;

  const inner = `
    <div class="top">
      <span class="topnav"><a class="back" href="/c/${esc(slug)}/">&larr; Dashboard</a> &middot; <a class="back" href="/c/${esc(slug)}/atlas">Ask Atlas &rarr;</a></span>
      ${selector}
    </div>
    <div class="meta">Report ${reportNo(idx)} &middot; ${esc(monthLabel(monthKey))} &middot; delivered ${esc(delivered)}</div>
    <h1 class="report-title">${esc(title)}</h1>
    ${renderCharts(r.facts_json)}
    <div class="body">${renderReportMarkdown(r.body_markdown)}</div>
    <div class="foot">This report is a frozen snapshot of what NeverRanked measured for ${esc(monthLabel(monthKey))}. Numbers do not change after delivery. Newer months appear as separate reports in the selector above.</div>`;

  return new Response(shell(`${title} · Report ${reportNo(idx)}`, inner), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

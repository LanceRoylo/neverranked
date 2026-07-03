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
  questions?: { appeared?: Array<{ q: string; engines: string[] }>; disappeared?: Array<{ q: string; engines: string[] }> };
  // Frozen per-chart analyst commentary ("The read this month"), written at
  // report generation from the same frozen numbers. Absent = mechanics-only.
  notes?: { engines?: string; venue?: string; sources?: string; topSources?: string; questions?: string };
}

// Question-level movement: a wins/losses list (not a chart -- the unit is a
// specific question, and reading the question IS the payload). Gold plus for
// newly cited, muted minus for no longer cited, engine chips per row.
function renderQuestionMovement(qs: NonNullable<ReportFacts["questions"]>, note?: string): string {
  const row = (e: { q: string; engines: string[] }, dir: "win" | "loss", i: number) => `
    <div class="qm-row ${dir}" style="--i:${i}">
      <span class="qm-mark">${dir === "win" ? "+" : "&minus;"}</span>
      <span class="qm-q">&ldquo;${esc(e.q)}&rdquo;</span>
      <span class="qm-eng">${e.engines.map((x) => `<span class="qm-chip">${esc(x)}</span>`).join("")}</span>
    </div>`;
  const appeared = (qs.appeared || []).filter((e) => e && typeof e.q === "string" && Array.isArray(e.engines));
  const disappeared = (qs.disappeared || []).filter((e) => e && typeof e.q === "string" && Array.isArray(e.engines));
  if (!appeared.length && !disappeared.length) return "";
  const groups: string[] = [];
  if (appeared.length) groups.push(`<div class="qm-h win">Newly cited</div>${appeared.map((e, i) => row(e, "win", i)).join("")}`);
  if (disappeared.length) groups.push(`<div class="qm-h loss">No longer cited</div>${disappeared.map((e, i) => row(e, "loss", appeared.length + i)).join("")}`);
  const cap = `Each line is one real question we ask the AI tools every month, and the tools where your citation status flipped since last month. A plus means a tool that ignored you now cites you for that question. A minus means the reverse. These flips show up before the totals move.`;
  return `<section class="nr-chart"><h3 class="nr-ctitle">Questions won and lost</h3><div class="nr-bars">${groups.join("")}</div>${chartText(cap, note)}</section>`;
}

/** The two text layers under a chart: the customer-specific analyst read
 *  (when present) and the generic how-to-read mechanics caption. */
function chartText(caption: string, note?: string): string {
  const read = note && typeof note === "string"
    ? `<p class="nr-read"><strong>The read this month.</strong> ${esc(note)}</p>` : "";
  return `${read}<p class="nr-cap"><strong>How to read this.</strong> ${caption}</p>`;
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
    <div class="nr-val"><span class="cnt" data-v="${num(pct)}">${num(pct)}</span>%${pill}</div>
  </div>`;
}

function chartBlock(title: string, bars: string, caption: string, note?: string): string {
  return `<section class="nr-chart"><h3 class="nr-ctitle">${esc(title)}</h3><div class="nr-bars">${bars}</div>${chartText(caption, note)}</section>`;
}

// Dumbbell / slope chart for the per-engine month-over-month move (used only when
// a prior value exists; a baseline report has no prev and falls back to bars).
// Two dots per engine (prior + current) on a track, connected by a direction-
// colored line, so the MOVEMENT is the visual, not a footnote pill.
function renderDumbbell(engines: ChartEngine[], prior: string, note?: string): string {
  const maxV = Math.max(...engines.map((e) => Math.max(num(e.pct), num(e.prev))), 1);
  const posOf = (v: number) => 4 + (num(v) / maxV) * 92; // inset [4%,96%] so dots never clip
  const rows = [...engines].sort((a, b) => num(b.pct) - num(a.pct)).map((e, i) => {
    const cur = num(e.pct), prev = num(e.prev);
    const pc = posOf(cur), pp = posOf(prev);
    const lo = Math.min(pc, pp), span = Math.abs(pc - pp);
    const dir = cur > prev ? "up" : cur < prev ? "down" : "flat";
    const title = `${e.name}: ${cur}% this period, ${cur >= prev ? "up" : "down"} from ${prev}%`;
    return `<div class="nr-row" style="--i:${i}" title="${esc(title)}">
      <div class="nr-lab">${esc(e.name)}</div>
      <div class="dumb-track">
        <div class="dumb-line ${dir}" style="left:${lo}%;width:${span}%"></div>
        <div class="dumb-dot prev" style="left:${pp}%"></div>
        <div class="dumb-dot cur" style="left:${pc}%"></div>
      </div>
      <div class="dumb-vals">${prev}<span class="to">&rarr;</span><span class="cur"><span class="cnt" data-v="${cur}">${cur}</span>%</span></div>
    </div>`;
  }).join("");
  const cap = `Each AI tool shows two dots. The hollow dot is ${prior} and the gold dot is this month. When the gold dot sits to the right of the hollow one, that tool cites you more than it did. To the left means less. The line is the size of the move.`;
  return `<section class="nr-chart"><h3 class="nr-ctitle">Where each AI tool cites you</h3><div class="nr-bars">${rows}</div>${chartText(cap, note)}</section>`;
}

// 100% stacked bar for the source-type composition (part-to-whole). One bar
// split into segments, "your own site" in gold, with a matched legend below.
const STACK_COLORS = ["#9c8a4e", "#75704f", "#5b563f", "#4a4436", "#3d382c", "#332f25", "#2b271f", "#232019"];
function renderStack(sources: ChartRow[], note?: string): string {
  const total = sources.reduce((s, r) => s + num(r.pct), 0) || 100;
  let ci = 0;
  const colors = sources.map((r) => (r.own ? "#d4c596" : STACK_COLORS[ci++ % STACK_COLORS.length]));
  const segs = sources.map((r, i) =>
    `<div class="stack-seg" style="width:${(num(r.pct) / total) * 100}%;background:${colors[i]}" title="${esc(r.label)}: ${num(r.pct)}%"></div>`).join("");
  const legend = sources.map((r, i) =>
    `<div class="leg-item${r.own ? " own" : ""}"><span class="leg-sw" style="background:${colors[i]}"></span>${esc(r.label)} <span class="leg-pct">${num(r.pct)}%</span></div>`).join("");
  const cap = `One bar, split by where the AI tools got their information. The independent web is most of it and your own site (the gold segment) is a thin sliver, which is why off-site presence matters as much as your own website.`;
  return `<section class="nr-chart"><h3 class="nr-ctitle">Where AI's answers come from</h3><div class="stack-bar">${segs}</div><div class="stack-legend">${legend}</div>${chartText(cap, note)}</section>`;
}

export function renderCharts(factsJson: string | null): string {
  if (!factsJson) return "";
  let f: ReportFacts;
  try { f = JSON.parse(factsJson) as ReportFacts; } catch { return ""; }
  if (!f || typeof f !== "object") return "";
  const prior = f.prior_label ? esc(f.prior_label) : "last month";
  const notes = f.notes && typeof f.notes === "object" ? f.notes : {};
  const blocks: string[] = [];

  // 1. Per-engine citation share. A dumbbell (foregrounds the movement) when a
  // prior month exists; bars for a baseline report (nothing to move from yet).
  const engines = Array.isArray(f.engines) ? f.engines.filter((e) => e && typeof e.name === "string") : [];
  if (engines.length) {
    if (engines.some((e) => typeof e.prev === "number")) {
      blocks.push(renderDumbbell(engines, prior, notes.engines));
    } else {
      const sorted = [...engines].sort((a, b) => num(b.pct) - num(a.pct));
      const max = Math.max(...sorted.map((e) => num(e.pct)), 1);
      const bars = sorted.map((e, i) => barRow(e.name, num(e.pct), max, i, { title: `${e.name}: ${num(e.pct)}% of its citations point to you` })).join("");
      const cap = `Each bar is the share of that AI tool's citations that point to your own site. Higher is better. This is your baseline; next month shows the movement.`;
      blocks.push(chartBlock("Where each AI tool cites you", bars, cap, notes.engines));
    }
  }

  // 2. Venue-share ranking (you highlighted).
  const vrows = f.venue && Array.isArray(f.venue.rows) ? f.venue.rows.filter((r) => r && typeof r.label === "string") : [];
  if (vrows.length) {
    const max = Math.max(...vrows.map((r) => num(r.pct)), 1);
    const bars = vrows.map((r, i) => barRow(r.label, num(r.pct), max, i, { hl: !!r.you, title: `${r.label}: ${num(r.pct)}% of venue citations` })).join("");
    const cap = `Of every mention the AI tools made of a venue in your category, this is who got named. Your bar is highlighted.`;
    blocks.push(chartBlock("Who AI names in your category", bars, cap, notes.venue));
  }

  // 3. Where the answers come from (source types) -- a 100% stacked bar (part-to-whole).
  const sources = Array.isArray(f.sources) ? f.sources.filter((r) => r && typeof r.label === "string") : [];
  if (sources.length) {
    blocks.push(renderStack(sources, notes.sources));
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
    blocks.push(chartBlock("The specific sites AI pulls from", bars, cap, notes.topSources));
  }

  // 5. Question-level movement (wins/losses since the prior window). Only
  // present when both windows had runs; a baseline report never shows it.
  if (f.questions && typeof f.questions === "object") {
    const qm = renderQuestionMovement(f.questions, notes.questions);
    if (qm) blocks.push(qm);
  }

  if (!blocks.length) return "";
  const heading = f.period_label ? `By the numbers &middot; ${esc(f.period_label)}` : "By the numbers";
  return `<div class="nrcharts"><div class="nr-h">${heading}</div>${blocks.join("")}</div>`;
}

export function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0c0b09; color:#e8e8ea; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  /* Warm glow behind the header: the page is ink, not void. */
  body::before { content:""; position:absolute; top:0; left:0; right:0; height:420px; pointer-events:none;
                 background:radial-gradient(620px 300px at 50% -80px, rgba(156,138,78,.13), transparent 70%); }
  .wrap { position:relative; max-width: 760px; margin: 0 auto; padding: 40px 24px 96px; }
  .top { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding-bottom:20px; border-bottom:1px solid #26241f; margin-bottom:36px; }
  .top a.back { color:#8a857a; text-decoration:none; font-size:14px; }
  .top a.back:hover { color:#d4c596; }
  .sel label { display:block; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  select { background:#151512; color:#e8e8ea; border:1px solid #38352d; border-radius:8px; padding:9px 12px; font-size:14px; min-width:220px; }
  select:hover { border-color:#d4c596; }
  .meta { font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:#8a857a; margin-bottom:6px; }
  /* The house display face (same identity as the pitch/teardown pages): the
     report is a dated evidentiary artifact, not a SaaS screen. */
  h1.report-title { font-family:Georgia,"Times New Roman",serif; font-weight:400; font-size:34px; margin:0 0 30px; letter-spacing:-.012em; line-height:1.15; color:#f2efe6; }
  .body h2 { font-family:Georgia,"Times New Roman",serif; font-weight:400; font-size:23px; margin:36px 0 12px; color:#f2efe6; letter-spacing:-.01em; }
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
  .nr-h { font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:#9c8a4e; margin:0 0 20px; padding-bottom:10px; border-bottom:1px solid #26241f; }
  /* Each chart is a card: background differentiation, not borders.
     Choreography: the card breathes in first (rise + fade), then the bars
     draw, then the values arrive, then the analyst read fades up. One
     gentle curve everywhere, generous stagger, nothing rushed. */
  .nr-chart { margin:0 0 22px; background:rgba(255,255,255,.026); border-radius:14px; padding:22px 24px 20px;
              opacity:0; transform:translateY(14px);
              transition:opacity 1.3s cubic-bezier(.22,1,.36,1), transform 1.3s cubic-bezier(.22,1,.36,1); }  .nr-chart.in { opacity:1; transform:none; }
  .nr-ctitle { font-family:Georgia,"Times New Roman",serif; font-weight:400; font-size:19px; color:#f2efe6; margin:0 0 16px; letter-spacing:-.01em; }
  .nr-bars { display:flex; flex-direction:column; gap:9px; }
  .nr-row { display:grid; grid-template-columns:154px 1fr 92px; align-items:center; gap:12px; }
  .nr-lab { font-size:13px; color:#c9c4b8; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nr-track { height:20px; background:#17160f; border-radius:5px; overflow:hidden; }
  .nr-fill { height:100%; background:#5b563f; border-radius:5px; transform:scaleX(0); transform-origin:left; transition:transform 1.9s cubic-bezier(.16,1,.3,1); transition-delay:calc(350ms + var(--i) * 150ms); }
  .nr-fill.nr-hl { background:linear-gradient(90deg,#d4c596,#b79a53); }
  .nr-row:hover .nr-fill { filter:brightness(1.12); }
  .nr-val { font-size:13px; color:#e8e8ea; font-variant-numeric:tabular-nums; opacity:0; transition:opacity 1.1s ease; transition-delay:calc(700ms + var(--i) * 150ms); }
  .nr-chart.in .nr-fill { transform:scaleX(1); }
  .nr-chart.in .nr-val { opacity:1; }
  .nr-d { font-size:11px; padding:1px 5px; border-radius:4px; margin-left:5px; }
  .nr-d.up { color:#7bdca0; background:rgba(123,220,160,.12); }
  .nr-d.down { color:#e0a488; background:rgba(224,164,136,.12); }
  .nr-d.even { color:#8a857a; }
  .nr-cap { font-size:13px; color:#8a857a; margin:12px 0 0; line-height:1.55; }
  .nr-cap strong { color:#b7b1a3; }
  /* The analyst read: customer-specific, sits above the mechanics caption and
     reads as the voice of the report (brighter, gold-edged), not a footnote. */
  .nr-read { font-size:14.5px; color:#d6d1c4; margin:14px 0 0; line-height:1.6;
             padding:10px 14px; border-left:2px solid #9c8a4e; background:rgba(156,138,78,.07); border-radius:0 6px 6px 0;
             opacity:0; transform:translateY(6px); transition:opacity 1.2s ease, transform 1.2s cubic-bezier(.22,1,.36,1); transition-delay:1.7s; }
  .nr-chart.in .nr-read { opacity:1; transform:none; }
  .nr-read strong { color:#d4c596; }
  /* Questions won and lost */
  .qm-h { font-size:11px; letter-spacing:.14em; text-transform:uppercase; margin:14px 0 6px; }
  .qm-h.win { color:#d4c596; }
  .qm-h.loss { color:#8a857a; }
  .qm-row { display:flex; align-items:baseline; gap:10px; padding:7px 0; border-bottom:1px solid rgba(255,255,255,.05);
            opacity:0; transform:translateY(6px); transition:opacity 1.1s ease, transform 1.1s cubic-bezier(.22,1,.36,1); transition-delay:calc(400ms + var(--i) * 180ms); }
  .nr-chart.in .qm-row { opacity:1; transform:none; }
  .qm-row:last-child { border-bottom:0; }
  .qm-mark { font-weight:700; width:14px; flex:0 0 auto; text-align:center; }
  .qm-row.win .qm-mark { color:#d4c596; }
  .qm-row.loss .qm-mark { color:#6f6a5e; }
  .qm-q { flex:1 1 auto; font-size:14.5px; color:#d6d1c4; }
  .qm-row.loss .qm-q { color:#a29d91; }
  .qm-eng { flex:0 0 auto; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  .qm-chip { font-size:11px; color:#b7b1a3; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); border-radius:99px; padding:2px 9px; white-space:nowrap; }
  .qm-row.win .qm-chip { color:#d4c596; border-color:rgba(212,197,150,.25); background:rgba(156,138,78,.10); }
  @media (max-width:560px){ .qm-row{display:grid; grid-template-columns:14px 1fr; row-gap:4px} .qm-eng{grid-column:2; justify-content:flex-start} }
  @media (max-width:560px){ .nr-row{ grid-template-columns:92px 1fr 70px; gap:8px; } .nr-lab{ font-size:12px; } }
  @media (prefers-reduced-motion:reduce){ .nr-fill{ transition:none; transform:scaleX(1); } .nr-val{ transition:none; opacity:1; } .nr-chart{ transition:none; opacity:1; transform:none; } .nr-read{ transition:none; opacity:1; transform:none; } .qm-row{ transition:none; opacity:1; transform:none; } }
  /* dumbbell (per-engine movement) */
  .dumb-track { position:relative; height:22px; }
  .dumb-track::before { content:""; position:absolute; left:0; right:0; top:50%; height:1px; background:#211e18; transform:translateY(-50%); }
  .dumb-line { position:absolute; top:50%; height:2px; transform:translateY(-50%) scaleX(0); transform-origin:left; transition:transform 1.7s cubic-bezier(.16,1,.3,1); transition-delay:calc(800ms + var(--i) * 150ms); }
  .nr-chart.in .dumb-line { transform:translateY(-50%) scaleX(1); }
  .dumb-line.up { background:#7bdca0; } .dumb-line.down { background:#e0a488; } .dumb-line.flat { background:#5b563f; }
  .dumb-dot { position:absolute; top:50%; width:11px; height:11px; border-radius:50%; transform:translate(-50%,-50%) scale(0); transition:transform 1s cubic-bezier(.22,1,.36,1); }
  .nr-chart.in .dumb-dot { transform:translate(-50%,-50%) scale(1); }
  /* The journey reads left to right: where you were, the move, where you are. */
  .dumb-dot.prev { background:#26231c; border:1.5px solid #5b563f; transition-delay:calc(400ms + var(--i) * 150ms); }
  .dumb-dot.cur { background:#d4c596; transition-delay:calc(1700ms + var(--i) * 150ms); }
  .dumb-vals { font-size:13px; color:#8a857a; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .dumb-vals .to { padding:0 3px; color:#4a4740; } .dumb-vals .cur { color:#e8e8ea; }
  /* stacked bar (source composition) */
  .stack-bar { display:flex; height:26px; border-radius:6px; overflow:hidden; margin:2px 0 16px; transform:scaleX(0); transform-origin:left; transition:transform 2.1s cubic-bezier(.16,1,.3,1); transition-delay:350ms; }
  .nr-chart.in .stack-bar { transform:scaleX(1); }
  .stack-seg { height:100%; }
  .stack-seg + .stack-seg { box-shadow:inset 1px 0 0 rgba(11,11,12,.55); }
  .stack-legend { display:flex; flex-wrap:wrap; gap:7px 16px; }
  .leg-item { font-size:12.5px; color:#c9c4b8; display:flex; align-items:center; gap:6px; opacity:0; transition:opacity 1.1s ease; transition-delay:1.4s; }
  .nr-chart.in .leg-item { opacity:1; }
  .leg-sw { width:10px; height:10px; border-radius:2px; flex:none; }
  .leg-pct { color:#8a857a; } .leg-item.own { color:#e8e8ea; } .leg-item.own .leg-pct { color:#d4c596; }
  @media (prefers-reduced-motion:reduce){ .dumb-line{ transition:none; transform:translateY(-50%) scaleX(1); } .dumb-dot{ transition:none; transform:translate(-50%,-50%) scale(1); } .stack-bar{ transition:none; transform:scaleX(1); } .leg-item{ transition:none; opacity:1; } }
  /* Print: the forwardable artifact. Black on white, charts intact, chrome gone. */
  @media print {
    body { background:#fff; color:#111; }
    body::before { display:none; }
    .top, .sel { display:none; }
    .wrap { max-width:100%; padding:0; }
    h1.report-title, .body h2, .nr-ctitle { color:#111; }
    .body p, .body li, .body td, .qm-q, .nr-lab, .dumb-vals, .leg-item { color:#222; }
    .meta, .nr-cap, .foot, .qm-h.loss, .leg-pct { color:#555; }
    .nr-h, .qm-h.win { color:#7a6a35; }
    .nr-chart { background:#f7f6f2; break-inside:avoid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .nr-read { background:#f3efe2; color:#333; border-left-color:#9c8a4e; }
    .nr-read strong { color:#7a6a35; }
    .nr-fill, .dumb-line, .dumb-dot, .stack-bar { transition:none !important; transform:none !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .nr-val, .leg-item { opacity:1 !important; color:#111; }
    .nr-track { background:#e8e5da; }
    .body a { color:#111; text-decoration:underline; }
  }
</style></head><body><div class="wrap">${inner}</div>
<script>
(function(){
  // Per-chart entrance: each card animates as IT enters the viewport (not all
  // at once when the container does), plus a count-up on the numeric values.
  var charts = document.querySelectorAll('.nr-chart');
  if(!charts.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(card){
    card.querySelectorAll('.cnt').forEach(function(el){
      var v = parseFloat(el.getAttribute('data-v')) || 0;
      if(reduce || v <= 0){ el.textContent = String(v); return; }
      // Starts as the value fades in (420ms), runs long and eases out hard,
      // so the number drifts into place rather than racing there.
      var t0 = null, D = 1900, DELAY = 700;
      function step(t){
        if(t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / D);
        p = 1 - Math.pow(1 - p, 5); // ease-out quint: most of the time is the landing
        el.textContent = String(Math.round(v * p));
        if(p < 1) requestAnimationFrame(step);
      }
      setTimeout(function(){ requestAnimationFrame(step); }, DELAY);
      // Hard settle: rAF can be throttled (background tab); the final value
      // must never depend on it.
      setTimeout(function(){ el.textContent = String(v); }, DELAY + D + 250);
    });
  }
  function arm(card){ card.classList.add('in'); countUp(card); }
  if(reduce || !('IntersectionObserver' in window)){ charts.forEach(arm); return; }
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ arm(e.target); io.unobserve(e.target); } });
    // threshold 0 + a small bottom rootMargin: fires shortly after the card's
    // top enters view. A ratio threshold can NEVER fire for a card taller
    // than the viewport (its ratio caps below the threshold), which froze
    // tall cards at opacity 0 on small screens.
  }, { threshold: 0, rootMargin: "0px 0px -12% 0px" });
  charts.forEach(function(c){ io.observe(c); });
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
      <span class="topnav"><a class="back" href="/c/${esc(slug)}/">&larr; Dashboard</a> &middot; <a class="back" href="/c/${esc(slug)}/plan">The plan</a> &middot; <a class="back" href="/c/${esc(slug)}/atlas">Ask Atlas &rarr;</a></span>
      ${selector}
    </div>
    <div class="meta">Report ${reportNo(idx)} &middot; ${esc(monthLabel(monthKey))} &middot; delivered ${esc(delivered)}</div>
    <h1 class="report-title">${esc(title)}</h1>
    ${renderCharts(r.facts_json)}
    ${r.facts_json ? `<div class="nr-h">The record &middot; full readout</div>` : ""}
    <div class="body">${renderReportMarkdown(r.body_markdown)}</div>
    <div class="foot">This report is a frozen snapshot of what NeverRanked measured for ${esc(monthLabel(monthKey))}. Numbers do not change after delivery. Newer months appear as separate reports in the selector above.</div>`;

  return new Response(shell(`${title} · Report ${reportNo(idx)}`, inner), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

/** GET /c/<slug>/plan — the standing engagement plan (expectation ladder).
 *  Set once at kickoff (customers.plan_markdown), frozen like a measurement:
 *  every monthly readout grades itself against this page. */
export async function handlePlanView(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/plan`));
  if (!userCanView(user as any, slug)) return new Response("Forbidden", { status: 403 });

  const row = await env.DB.prepare(
    `SELECT name, plan_markdown, plan_set_at FROM customers WHERE client_slug = ?`,
  ).bind(slug).first<{ name: string; plan_markdown: string | null; plan_set_at: number | null }>();

  const nav = `<div class="top"><span class="topnav"><a class="back" href="/c/${esc(slug)}/">&larr; Dashboard</a> &middot; <a class="back" href="/c/${esc(slug)}/readouts">Past reports &rarr;</a></span></div>`;

  if (!row?.plan_markdown) {
    return new Response(shell("The plan", `${nav}
      <div class="empty">Your engagement plan will appear here.<br>It is set at kickoff and stays fixed, so every monthly report can be graded against it.</div>`),
      { status: 200, headers: { "content-type": "text/html;charset=utf-8" } });
  }

  const setOn = row.plan_set_at
    ? new Date(row.plan_set_at * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  const inner = `${nav}
    <div class="meta">The plan${setOn ? ` &middot; set ${esc(setOn)}` : ""} &middot; fixed at kickoff</div>
    <div class="body">${renderReportMarkdown(row.plan_markdown)}</div>
    <div class="foot">This plan is written down and does not change. Each monthly report opens against it, so you always know what we said to expect and whether it happened.</div>`;

  return new Response(shell(`The plan · ${row.name}`, inner), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

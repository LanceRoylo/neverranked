/**
 * Customer Dashboard — /c/<slug>/
 *
 * Read-only view for paying customers between monthly memos.
 * Built per DASHBOARD-SPEC.md. Minimal chrome (no sidebar, no
 * navigation, no settings). Five sections only:
 *
 *   1. Header strip  (customer name, category, last-measured,
 *                     next monthly memo date, "Message Lance")
 *   2. Current position card  (mentions, cohort rank, per-AI-tool bars)
 *   3. What changed in the last 7 days  (templated, observational)
 *   4. Currently observable gaps  (templated, observational)
 *   5. Top 10 cohort table  +  8-week trend chart
 *
 * Auth: magic-link via the existing auth.ts helpers. Only the
 * customer's own email (registered in `customers` table or matched
 * via client_slug) can view their /c/<slug>/. Admins can view any.
 *
 * Data layer: `loadCustomerView(env, slug)` is the single function
 * the route depends on. Returns CustomerViewData or null. Day-1
 * implementation returns hardcoded Hamada data for slug
 * "hamada-financial-group"; future D1 implementation reads from
 * citation_runs + cohort tables and computes the same shape.
 *
 * Templated copy generators are pure functions: given measurement
 * deltas, return human-readable observational bullets. No LLM,
 * no fabrication risk. Per spec decision: customer-facing
 * narrative is the wrong place to introduce LLM hallucination.
 */

import type { Env } from "../types";
import { getUser } from "../auth";
import { redirect, esc } from "../render";

// ── Data shape (returned by loadCustomerView) ─────────────────────

interface ToolCount {
  tool: string;        // "Perplexity" | "Google AIO" | etc.
  shortName: string;   // for mobile + bars
  count: number;
}

interface CohortRow {
  host: string;        // "fhb.com (First Hawaiian Advisors)"
  mentions: number;
  position: string;    // "early (64%)" | "lead (83%)" | "scattered (47%)"
  toolsCount: string;  // "6/7"
  isYou: boolean;
}

interface ChangedEvent {
  kind: "gain" | "drop" | "shift" | "new";
  whenLabel: string;   // "2 days ago"
  text: string;        // observational sentence with <strong> emphasis
}

interface ObservableGap {
  text: string;        // observational sentence
}

interface TrendPoint {
  weekIso: string;
  yourMentions: number;
  cohortAvg: number;
}

interface CustomerViewData {
  slug: string;
  customerName: string;
  category: string;
  lastMeasuredAgo: string;     // "4 hours ago"
  nextMemoDate: string;        // "2026-06-25"
  // Position
  yourMentions: number;
  totalQuestions: number;
  cohortAvgMentions: number;
  cohortRank: number;
  cohortSize: number;
  mentionsDelta7d: number;     // +1, 0, -1, etc.
  rankDelta7d: number;
  perTool: ToolCount[];
  // Changes (last 7 days)
  changedEvents: ChangedEvent[];
  // Gaps (currently observable)
  observableGaps: ObservableGap[];
  // Cohort
  cohortTop10: CohortRow[];
  // Trend (last 8 weeks)
  trend: TrendPoint[];
  // Optional display overrides for share-based (D1) customers. Defaults below
  // preserve the original count-based Hamada fixture rendering.
  metricUnit?: string;          // "" = counts (default) | "%" = citation share
  cohortMetricLabel?: string;   // "Mentions" (default) | "Share of venue citations"
  trendLabel?: string;          // section-5 label override
  // Cadence overrides. The Hamada fixture is weekly/count-based; live D1
  // customers come in monthly/share-based on a single baseline snapshot, so
  // the weekly framing ("this week", "vs 7 days ago") is wrong for them.
  positionLabel?: string;       // section-1 label (default "Where you are this week")
  changedLabel?: string;        // section-2 label (default "What changed in the last 7 days")
  deltaSuffix?: string;         // delta tail (default "vs 7 days ago")
  isBaseline?: boolean;         // first measurement: deltas read "baseline", not "unchanged"
  footerCadence?: string;       // footer cadence note (default daily-update line)
}

// ── Day-1 hardcoded data (Hamada Financial Group) ────────────────
// Future: replace with D1 query layer reading citation_runs +
// cohort_membership for the slug. Keeping it hardcoded so the layout
// + auth + routing can be validated end-to-end before the data
// migration commits to a schema.

const HAMADA_DATA: CustomerViewData = {
  slug: "hamada-financial-group",
  customerName: "Hamada Financial Group",
  category: "Hawaii wealth management",
  lastMeasuredAgo: "4 hours ago",
  nextMemoDate: "2026-06-25",
  yourMentions: 4,
  totalQuestions: 18,
  cohortAvgMentions: 6,
  cohortRank: 17,
  cohortSize: 42,
  mentionsDelta7d: +1,
  rankDelta7d: 0,
  perTool: [
    { tool: "Perplexity", shortName: "Perplexity", count: 3 },
    { tool: "Google AI Overviews", shortName: "Google AIO", count: 3 },
    { tool: "Gemini grounded", shortName: "Gemini", count: 2 },
    { tool: "ChatGPT search", shortName: "ChatGPT", count: 0 },
    { tool: "Microsoft Copilot (Bing)", shortName: "MS Copilot", count: 0 },
    { tool: "Claude", shortName: "Claude", count: 0 },
    { tool: "Gemma", shortName: "Gemma", count: 0 },
  ],
  changedEvents: [
    {
      kind: "gain",
      whenLabel: "2 days ago",
      text: 'The question <strong>"Hawaii financial advisor for business sale proceeds"</strong> started mentioning you on Tuesday. Previously empty across all AI tools for your firm.',
    },
    {
      kind: "shift",
      whenLabel: "3 days ago",
      text: 'Position on <strong>"Hamada Financial vs Cadinha vs CKW"</strong> moved from second-mentioned to first-mentioned on Perplexity over the last 3 days. Same question, same competitors.',
    },
    {
      kind: "new",
      whenLabel: "5 days ago",
      text: 'A new third-party publication (Pacific Business News) was cited by Google AI Overviews for the first time on <strong>"best Hawaii financial advisor for retirement planning"</strong>. The article does not mention your firm.',
    },
    {
      kind: "shift",
      whenLabel: "6 days ago",
      text: 'Cohort competitor <strong>masudalehrman.com</strong> gained 4 mentions on Microsoft Copilot since last week. Previously cited zero times by Copilot for any firm in the cohort. (Cohort-wide Copilot gap may be starting to close.)',
    },
  ],
  observableGaps: [
    { text: 'The question <strong>"best wealth manager in Hawaii"</strong> is currently empty for your firm. 6 of 42 cohort competitors appear there.' },
    { text: "Your firm has zero mentions on Microsoft Copilot for any question in the set. Same is true for 38 of 42 cohort competitors (cohort-wide gap)." },
    { text: "Your firm has zero mentions in Claude or Gemma (training-data layer). 7 cohort competitors have non-zero presence in at least one." },
    { text: "SmartAsset profile not detected in any cited URL. 11 cohort competitors are cited via their SmartAsset profile at least once in the measurement window." },
  ],
  cohortTop10: [
    { host: "fhb.com (First Hawaiian Advisors)", mentions: 79, position: "early (64%)", toolsCount: "6/7", isYou: false },
    { host: "morganstanley.com (Morgan Stanley Hawaii)", mentions: 63, position: "early (50%)", toolsCount: "5/7", isYou: false },
    { host: "masudalehrman.com (Masuda Lehrman Wealth)", mentions: 59, position: "lead (83%)", toolsCount: "4/7", isYou: false },
    { host: "advisor.morganstanley.com", mentions: 53, position: "early (55%)", toolsCount: "3/7", isYou: false },
    { host: "fphawaii.com (Financial Pacific Hawaii)", mentions: 43, position: "lead (65%)", toolsCount: "3/7", isYou: false },
    { host: "boh.com (Bank of Hawaii Wealth)", mentions: 35, position: "lead (66%)", toolsCount: "4/7", isYou: false },
    { host: "creativeplanning.com (Creative Planning HI)", mentions: 30, position: "scattered (47%)", toolsCount: "3/7", isYou: false },
    { host: "3dwealthadvisors.com (Hawaii Partners 3D)", mentions: 27, position: "early (59%)", toolsCount: "4/7", isYou: false },
    { host: "raymondjames.com (Raymond James HI)", mentions: 14, position: "scattered (43%)", toolsCount: "3/7", isYou: false },
    { host: "hamadafinancialgroup.com (your firm)", mentions: 8, position: "(only the named query)", toolsCount: "3/7", isYou: true },
  ],
  trend: [
    { weekIso: "8wk ago", yourMentions: 1, cohortAvg: 5 },
    { weekIso: "7wk ago", yourMentions: 1, cohortAvg: 5 },
    { weekIso: "6wk ago", yourMentions: 1, cohortAvg: 5 },
    { weekIso: "5wk ago", yourMentions: 2, cohortAvg: 6 },
    { weekIso: "4wk ago", yourMentions: 2, cohortAvg: 6 },
    { weekIso: "3wk ago", yourMentions: 3, cohortAvg: 6 },
    { weekIso: "2wk ago", yourMentions: 3, cohortAvg: 6 },
    { weekIso: "this wk", yourMentions: 4, cohortAvg: 6 },
  ],
};

/**
 * Load the dashboard data for a customer slug. Day-1 returns
 * hardcoded data only for "hamada-financial-group". Other slugs
 * return null (caller renders 404).
 *
 * Future: read from D1 citation_runs + cohort_membership tables,
 * compute the same shape, return.
 */
export async function loadCustomerView(
  env: Env,
  slug: string,
): Promise<CustomerViewData | null> {
  // Real customers are served from D1 (populated by the research->D1 bridge).
  const fromD1 = await buildFromD1(env, slug);
  if (fromD1) return fromD1;
  // Hamada remains a hardcoded fixture (no live run wired yet).
  if (slug === "hamada-financial-group") return HAMADA_DATA;
  return null;
}

// Build the dashboard shape from D1 for a slug that has a canonical snapshot.
// Headline numbers come from citation_snapshots (share-of-citations, the same
// metric the published readout uses), so the dashboard and the readout agree.
const TOOL_SHORT: Record<string, string> = {
  "ChatGPT search": "ChatGPT", "Perplexity": "Perplexity", "Gemini grounded": "Gemini",
  "Google AI Overviews": "Google AIO", "Microsoft Copilot": "MS Copilot", "Claude": "Claude", "Gemma": "Gemma",
};

async function buildFromD1(env: Env, slug: string): Promise<CustomerViewData | null> {
  const cust = await env.DB.prepare(
    `SELECT name, category, category_label FROM customers WHERE client_slug = ?`
  ).bind(slug).first<{ name: string; category: string; category_label: string | null }>();
  if (!cust) return null;

  const snap = await env.DB.prepare(
    `SELECT week_start, total_queries, client_citations, engines_breakdown, top_competitors
       FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`
  ).bind(slug).first<{ week_start: number; total_queries: number; client_citations: number; engines_breakdown: string; top_competitors: string }>();
  if (!snap) return null; // no measurement yet: fall through (404 or fixture)

  let eb: Record<string, { citations: number; total: number; share_pct: number }> = {};
  let tc: { htc_venue_share_pct?: number; htc_engines_count?: number; competitors?: Array<{ domain: string; label: string; venue_share_pct: number; engines_count?: number }> } = {};
  try { eb = JSON.parse(snap.engines_breakdown || "{}"); } catch { /* keep empty */ }
  try { tc = JSON.parse(snap.top_competitors || "{}"); } catch { /* keep empty */ }

  const perTool: ToolCount[] = Object.entries(eb)
    .map(([tool, v]) => ({ tool, shortName: TOOL_SHORT[tool] || tool, count: v.share_pct }))
    .sort((a, b) => b.count - a.count);

  const competitors = tc.competitors || [];
  const ownShare = tc.htc_venue_share_pct ?? 0;
  const cohortTop10: CohortRow[] = [
    { host: `${cust.name} (you)`, mentions: ownShare, position: "", toolsCount: `${tc.htc_engines_count ?? 0}/7`, isYou: true },
    ...competitors.map((c) => ({ host: `${c.domain} (${c.label})`, mentions: c.venue_share_pct, position: "", toolsCount: `${c.engines_count ?? 0}/7`, isYou: false })),
  ].sort((a, b) => b.mentions - a.mentions);
  const cohortAvg = competitors.length
    ? Math.round(competitors.reduce((s, c) => s + c.venue_share_pct, 0) / competitors.length)
    : 0;

  // Last measured = newest citation_runs.run_at for this slug.
  const measured = await env.DB.prepare(
    `SELECT MAX(cr.run_at) AS t FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id WHERE ck.client_slug = ?`
  ).bind(slug).first<{ t: number | null }>();
  const measuredAgo = measured?.t ? agoLabel(measured.t) : "recently";

  // Observable gaps derived from the snapshot (honest, data-grounded).
  const gaps: ObservableGap[] = [];
  const copilot = eb["Microsoft Copilot"];
  const chatgpt = eb["ChatGPT search"];
  if (copilot && copilot.share_pct === 0) gaps.push({ text: "Microsoft Copilot does not cite your site on any question (0%). It draws on the Bing index, which also limits ChatGPT search." });
  if (chatgpt && chatgpt.share_pct > 0 && chatgpt.share_pct <= 8) gaps.push({ text: `ChatGPT search cites you on only ${chatgpt.share_pct}% of citations, your lowest web-search engine. Same Bing-index root as the Copilot gap.` });
  // Generic fallback so section 3 never renders empty. No customer-specific
  // copy is hardcoded here: the named, per-firm gaps live in the monthly readout.
  if (gaps.length === 0) gaps.push({ text: "No empty-engine gaps in this baseline. Your first monthly readout names the per-question openings and which competitors hold them." });

  return {
    slug,
    customerName: cust.name,
    category: cust.category_label || cust.category,
    lastMeasuredAgo: measuredAgo,
    nextMemoDate: nextMemoDate(),
    yourMentions: snap.client_citations,
    totalQuestions: snap.total_queries,
    cohortAvgMentions: cohortAvg,
    cohortRank: cohortTop10.findIndex((r) => r.isYou) + 1,
    cohortSize: competitors.length + 1,
    mentionsDelta7d: 0,
    rankDelta7d: 0,
    perTool,
    changedEvents: [
      { kind: "new", whenLabel: "this week", text: "First full 7-tool baseline measurement is in. From next month, this section shows what moved against it." },
    ],
    observableGaps: gaps,
    cohortTop10,
    trend: [{ weekIso: "baseline", yourMentions: ownShare, cohortAvg }],
    metricUnit: "%",
    cohortMetricLabel: "Share of venue citations",
    trendLabel: "Citation-share baseline (trend builds monthly)",
    positionLabel: "Where you are now",
    changedLabel: "Your baseline measurement",
    isBaseline: true,
    footerCadence: "Refreshed with each monthly readout",
  };
}

function agoLabel(unixSec: number): string {
  const days = Math.max(0, Math.floor((Date.now() / 1000 - unixSec) / 86400));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function nextMemoDate(): string {
  const d = new Date();
  // Monthly memo lands on the 25th; show this month's if still upcoming, else next.
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const target = d.getUTCDate() <= 25 ? new Date(Date.UTC(y, m, 25)) : new Date(Date.UTC(y, m + 1, 25));
  return target.toISOString().slice(0, 10);
}

// ── Authorization ────────────────────────────────────────────────

/**
 * Returns true if the user is allowed to view this customer's slug.
 * Admins can view any slug. Customers can view only their own
 * (matched on client_slug).
 */
function userCanView(user: { role?: string; client_slug?: string }, slug: string): boolean {
  if (user.role === "admin") return true;
  if (user.client_slug === slug) return true;
  return false;
}

// ── Route handler ────────────────────────────────────────────────

export async function handleCustomerView(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return redirect("/login?next=" + encodeURIComponent(`/c/${slug}/`));

  if (!userCanView(user as any, slug)) {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await loadCustomerView(env, slug);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(renderCustomerView(data), {
    status: 200,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

// ── HTML render ──────────────────────────────────────────────────

function deltaText(n: number, suffix = "vs 7 days ago"): { className: string; text: string } {
  if (n > 0) return { className: "up", text: `+${n} ${suffix}` };
  if (n < 0) return { className: "down", text: `${n} ${suffix}` };
  return { className: "flat", text: `unchanged ${suffix}` };
}

function renderCustomerView(d: CustomerViewData): string {
  const baselineDelta = { className: "flat", text: "baseline · first measurement" };
  const mentionsDelta = d.isBaseline ? baselineDelta : deltaText(d.mentionsDelta7d, d.deltaSuffix);
  const rankDelta = d.isBaseline ? baselineDelta : deltaText(d.rankDelta7d, d.deltaSuffix);
  const maxToolCount = Math.max(1, ...d.perTool.map((t) => t.count));

  // Trend SVG: 8 points, normalized to 200px height
  const trendW = 800;
  const trendH = 200;
  const padX = 50;
  const allValues = [...d.trend.map((p) => p.yourMentions), ...d.trend.map((p) => p.cohortAvg)];
  const yMin = 0;
  const yMax = Math.max(8, Math.ceil(Math.max(...allValues) * 1.2));
  const xStep = (trendW - 2 * padX) / Math.max(1, d.trend.length - 1);
  const yScale = (val: number) => trendH - 30 - ((val - yMin) / (yMax - yMin)) * (trendH - 60);
  const yourPoints = d.trend.map((p, i) => `${padX + i * xStep},${yScale(p.yourMentions)}`).join(" ");
  const avgPoints = d.trend.map((p, i) => `${padX + i * xStep},${yScale(p.cohortAvg)}`).join(" ");
  const lastYour = d.trend[d.trend.length - 1];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(d.customerName)} &middot; NeverRanked dashboard</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0b0c;
    --panel: #131316;
    --panel-light: #1a1a1d;
    --gold: #d4c596;
    --gold-bright: #e8c767;
    --gold-dim: #4a3d18;
    --text: #e8e8ea;
    --soft: #b9b9bd;
    --dim: #6a6a70;
    --line: #2a2a2e;
    --line-soft: #1c1c1e;
    --green: #7fb88b;
    --red: #d48a8a;
    --mono: ui-monospace, "SF Mono", Menlo, monospace;
    --serif: Georgia, "Times New Roman", serif;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); }
  body { font-family: var(--serif); color: var(--text); line-height: 1.55; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 22px 80px; }

  /* Top strip */
  .top {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 22px; border-bottom: 1px solid var(--line);
    margin-bottom: 32px; flex-wrap: wrap; gap: 18px;
  }
  .top-left .customer {
    font-family: var(--serif); font-size: 22px; color: var(--text);
    margin: 0 0 4px;
  }
  .top-left .category {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--gold);
  }
  .top-right { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
  .top-right .meta {
    font-family: var(--mono); font-size: 11px; color: var(--dim);
    text-align: right;
  }
  .top-right .meta strong { color: var(--text); }
  .top-msg {
    padding: 9px 16px; background: transparent;
    border: 1px solid var(--gold-dim); border-radius: 4px;
    color: var(--gold); font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.1em; text-transform: uppercase;
    text-decoration: none; cursor: pointer;
    transition: border-color 200ms ease, background 200ms ease;
  }
  .top-msg:hover { border-color: var(--gold); background: rgba(212,197,150,0.06); }

  /* Section labels */
  .section { margin-bottom: 40px; }
  .section-label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--dim); margin-bottom: 14px;
  }
  .section-label .n { color: var(--gold); margin-right: 10px; }

  /* Current position card */
  .position-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .position-card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; padding: 24px 26px;
  }
  .position-card .label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--dim); margin-bottom: 10px;
  }
  .position-card .value {
    font-family: var(--serif); font-size: 36px; color: var(--gold);
    line-height: 1.1; margin-bottom: 8px;
  }
  .position-card .value .denom { font-size: 22px; color: var(--dim); }
  .position-card .delta {
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.04em;
  }
  .delta.up { color: var(--green); }
  .delta.down { color: var(--red); }
  .delta.flat { color: var(--dim); }

  /* Per-tool bars */
  .tool-grid {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px;
    margin-top: 22px;
  }
  .tool-cell { text-align: center; }
  .tool-name {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
    color: var(--dim); margin-bottom: 8px; line-height: 1.3; min-height: 26px;
  }
  .tool-bar {
    height: 60px; background: var(--line-soft); border-radius: 2px;
    position: relative; overflow: hidden;
  }
  .tool-fill {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: var(--gold);
  }
  .tool-fill.zero {
    background: transparent;
    border: 1px dashed var(--gold-dim); box-sizing: border-box;
  }
  .tool-count {
    font-family: var(--mono); font-size: 11px; color: var(--text);
    margin-top: 8px; font-variant-numeric: tabular-nums;
  }

  /* Changed list */
  .changed-list {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; padding: 4px 0;
  }
  .changed-row {
    padding: 16px 26px; border-bottom: 1px solid var(--line-soft);
    display: flex; gap: 14px; align-items: flex-start;
  }
  .changed-row:last-child { border-bottom: none; }
  .changed-icon {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; padding: 3px 8px; border-radius: 3px;
    flex-shrink: 0; min-width: 60px; text-align: center; margin-top: 2px;
  }
  .changed-icon.gain { background: rgba(127,184,139,0.14); color: var(--green); border: 1px solid rgba(127,184,139,0.32); }
  .changed-icon.drop { background: rgba(212,138,138,0.14); color: var(--red); border: 1px solid rgba(212,138,138,0.32); }
  .changed-icon.shift { background: rgba(212,197,150,0.14); color: var(--gold); border: 1px solid rgba(212,197,150,0.32); }
  .changed-icon.new { background: rgba(232,199,103,0.14); color: var(--gold-bright); border: 1px solid rgba(232,199,103,0.32); }
  .changed-text {
    font-family: var(--serif); font-size: 15px; color: var(--soft);
    line-height: 1.5; flex: 1;
  }
  .changed-text strong { color: var(--text); }
  .changed-when {
    font-family: var(--mono); font-size: 11px; color: var(--dim);
    flex-shrink: 0; margin-top: 2px;
  }
  .gaps-list .changed-row .changed-icon {
    background: rgba(212,138,138,0.10); color: var(--red);
    border-color: rgba(212,138,138,0.28);
  }

  /* Memo pointer banner (preempts "where's the fix-this part?") */
  .memo-pointer {
    background: linear-gradient(180deg, rgba(212,197,150,0.08), rgba(212,197,150,0.02));
    border: 1px solid rgba(212,197,150,0.30);
    border-radius: 6px;
    padding: 18px 22px;
    margin: 32px 0 0;
    display: flex; gap: 14px; align-items: flex-start;
  }
  .memo-pointer-icon {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--gold-bright);
    background: rgba(232,199,103,0.12);
    border: 1px solid rgba(232,199,103,0.32);
    padding: 4px 10px; border-radius: 3px;
    flex-shrink: 0;
  }
  .memo-pointer-text {
    font-family: var(--serif); font-size: 14px; color: var(--soft);
    line-height: 1.55; flex: 1;
  }
  .memo-pointer-text strong { color: var(--text); }

  /* Cohort table */
  table.cohort {
    width: 100%; border-collapse: collapse; font-size: 14px; color: var(--soft);
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; overflow: hidden;
  }
  table.cohort th {
    color: var(--gold); text-align: left; font-weight: 400;
    letter-spacing: 0.06em; text-transform: uppercase; font-size: 11px;
    padding: 14px 18px; border-bottom: 1px solid var(--line);
    font-family: var(--mono);
  }
  table.cohort td {
    padding: 12px 18px; border-bottom: 1px solid var(--line-soft);
    font-variant-numeric: tabular-nums;
  }
  table.cohort tr:last-child td { border-bottom: none; }
  table.cohort td.num { text-align: right; }
  table.cohort tr.you td { background: rgba(212,197,150,0.06); color: var(--text); }
  table.cohort tr.you td:first-child { border-left: 2px solid var(--gold); padding-left: 16px; }

  /* Trend chart */
  .trend-wrap {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; padding: 24px 26px;
  }
  .trend-svg { width: 100%; height: 200px; display: block; }

  /* Footer */
  .footer {
    margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line);
    font-family: var(--mono); font-size: 11px; color: var(--dim);
    letter-spacing: 0.06em; display: flex; justify-content: space-between;
    flex-wrap: wrap; gap: 18px;
  }
  .footer a { color: var(--gold); text-decoration: none; }

  @media (max-width: 700px) {
    .wrap { padding: 18px 16px 60px; }
    .position-grid { grid-template-columns: 1fr; }
    .tool-grid { grid-template-columns: repeat(4, 1fr); }
    .tool-name { min-height: 30px; }
    table.cohort th, table.cohort td { padding: 10px 12px; font-size: 13px; }
    .top-right .meta { text-align: left; }
  }
  @media (max-width: 460px) {
    .tool-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
</head>
<body>
  <div class="wrap">

    <!-- Header strip -->
    <div class="top">
      <div class="top-left">
        <div class="customer">${esc(d.customerName)}</div>
        <div class="category">${esc(d.category)}</div>
      </div>
      <div class="top-right">
        <div class="meta">
          Last measured <strong>${esc(d.lastMeasuredAgo)}</strong><br>
          Next monthly memo <strong>${esc(d.nextMemoDate)}</strong>
        </div>
        <a class="top-msg" href="mailto:Lance@hi.neverranked.com?subject=${encodeURIComponent(d.customerName + " - dashboard question")}">Message Lance &rarr;</a>
      </div>
    </div>

    <!-- Section 1: Current position -->
    <div class="section">
      <div class="section-label"><span class="n">01</span>${esc(d.positionLabel ?? "Where you are this week")}</div>
      <div class="position-grid">
        <div class="position-card">
          <div class="label">Questions mentioning you</div>
          <div class="value">${d.yourMentions} <span class="denom">of ${d.totalQuestions}</span></div>
          <div class="delta ${mentionsDelta.className}">${esc(mentionsDelta.text)} &middot; cohort average: ${d.cohortAvgMentions} of ${d.totalQuestions}</div>
        </div>
        <div class="position-card">
          <div class="label">Cohort rank</div>
          <div class="value">${d.cohortRank} <span class="denom">of ${d.cohortSize}</span></div>
          <div class="delta ${rankDelta.className}">${esc(rankDelta.text)}</div>
        </div>
      </div>

      <div class="tool-grid">
        ${d.perTool.map((t) => `
        <div class="tool-cell">
          <div class="tool-name">${esc(t.shortName)}</div>
          <div class="tool-bar"><div class="tool-fill${t.count === 0 ? ' zero' : ''}" style="height:${t.count === 0 ? 0 : Math.round((t.count / maxToolCount) * 70 + 10)}%"></div></div>
          <div class="tool-count">${t.count}${esc(d.metricUnit ?? "")}</div>
        </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 2: What changed in 7 days -->
    <div class="section">
      <div class="section-label"><span class="n">02</span>${esc(d.changedLabel ?? "What changed in the last 7 days")}</div>
      <div class="changed-list">
        ${d.changedEvents.length === 0 ? `
          <div class="changed-row"><div class="changed-text" style="color:var(--dim);font-style:italic">No significant changes in the last 7 days. The data has been stable.</div></div>
        ` : d.changedEvents.map((e) => `
          <div class="changed-row">
            <div class="changed-icon ${e.kind}">${e.kind === 'new' ? 'New source' : e.kind === 'gain' ? 'Gain' : e.kind === 'drop' ? 'Drop' : 'Shift'}</div>
            <div class="changed-text">${e.text}</div>
            <div class="changed-when">${esc(e.whenLabel)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 3: Currently observable gaps -->
    <div class="section">
      <div class="section-label"><span class="n">03</span>Currently observable gaps</div>
      <div class="changed-list gaps-list">
        ${d.observableGaps.map((g) => `
          <div class="changed-row">
            <div class="changed-icon">Gap</div>
            <div class="changed-text">${g.text}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Memo pointer: explains the two-layer model in-product. The
         dashboard surfaces signals daily; the monthly memo turns
         signals into prioritized action. This banner preempts the
         "where's the fix-this part?" question by pointing at when
         and where the action layer arrives. -->
    <div class="memo-pointer">
      <div class="memo-pointer-icon">Next memo</div>
      <div class="memo-pointer-text">
        This dashboard shows you what changed and where the gaps are. Your next monthly delta memo arrives <strong>${esc(d.nextMemoDate)}</strong> and turns these signals into your prioritized punch list: what to ship first, what to skip this month, what the cohort movement actually means for your firm.
      </div>
    </div>

    <!-- Section 4: Cohort table -->
    <div class="section">
      <div class="section-label"><span class="n">04</span>Top 10 in your cohort</div>
      <table class="cohort">
        <thead><tr><th>Firm</th><th class="num">${esc(d.cohortMetricLabel ?? "Mentions")}</th><th>Where in answer</th><th class="num">AI tools</th></tr></thead>
        <tbody>
          ${d.cohortTop10.map((r) => `
            <tr${r.isYou ? ' class="you"' : ''}>
              <td>${r.isYou ? '<strong>' : ''}${esc(r.host)}${r.isYou ? '</strong>' : ''}</td>
              <td class="num">${r.isYou ? `<strong>${r.mentions}${esc(d.metricUnit ?? "")}</strong>` : `${r.mentions}${esc(d.metricUnit ?? "")}`}</td>
              <td>${esc(r.position)}</td>
              <td class="num">${esc(r.toolsCount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Section 5: Trend -->
    <div class="section">
      <div class="section-label"><span class="n">05</span>${esc(d.trendLabel ?? "Last 8 weeks of mention share")}</div>
      <div class="trend-wrap">
        <svg class="trend-svg" viewBox="0 0 ${trendW} ${trendH}" preserveAspectRatio="none">
          <line x1="0" y1="40" x2="${trendW}" y2="40" stroke="#1c1c1e" stroke-width="1"/>
          <line x1="0" y1="80" x2="${trendW}" y2="80" stroke="#1c1c1e" stroke-width="1"/>
          <line x1="0" y1="120" x2="${trendW}" y2="120" stroke="#1c1c1e" stroke-width="1"/>
          <line x1="0" y1="160" x2="${trendW}" y2="160" stroke="#1c1c1e" stroke-width="1"/>
          <polyline points="${yourPoints}" fill="none" stroke="#d4c596" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="${avgPoints}" fill="none" stroke="#3a3a3e" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>
          <g fill="#d4c596">
            ${d.trend.map((p, i) => `<circle cx="${padX + i * xStep}" cy="${yScale(p.yourMentions)}" r="${i === d.trend.length - 1 ? 6 : 4}"${i === d.trend.length - 1 ? ' stroke="#0b0b0c" stroke-width="2"' : ''}/>`).join('')}
          </g>
          <text x="${trendW - 30}" y="${yScale(lastYour.yourMentions) - 10}" fill="#d4c596" font-family="ui-monospace, monospace" font-size="11" text-anchor="end">you: ${lastYour.yourMentions} of ${d.totalQuestions}</text>
          <text x="${trendW - 30}" y="${yScale(lastYour.cohortAvg) - 10}" fill="#6a6a70" font-family="ui-monospace, monospace" font-size="11" text-anchor="end">cohort avg: ${lastYour.cohortAvg} of ${d.totalQuestions}</text>
          <text x="${padX}" y="${trendH - 5}" fill="#6a6a70" font-family="ui-monospace, monospace" font-size="10">${esc(d.trend[0].weekIso)}</text>
          <text x="${trendW - padX}" y="${trendH - 5}" fill="#6a6a70" font-family="ui-monospace, monospace" font-size="10" text-anchor="end">${esc(d.trend[d.trend.length - 1].weekIso)}</text>
        </svg>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>${esc(d.footerCadence ?? "Data updated daily at 06:00 HST")} &middot; <a href="https://neverranked.com/methodology/">methodology</a> &middot; <a href="https://neverranked.com/takedowns/">opt-out</a></div>
      <div>Lance Roylo &middot; <a href="mailto:Lance@hi.neverranked.com">Lance@hi.neverranked.com</a> &middot; <a href="/logout">sign out</a></div>
    </div>

  </div>
</body>
</html>`;
}

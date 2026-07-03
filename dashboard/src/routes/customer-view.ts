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
import { isReadoutShapeSnapshot } from "../lib/snapshot-shape";

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
    `SELECT week_start, created_at, total_queries, client_citations, engines_breakdown, top_competitors
       FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`
  ).bind(slug).first<{ week_start: number; created_at: number | null; total_queries: number; client_citations: number; engines_breakdown: string; top_competitors: string }>();
  if (!snap) return null; // no measurement yet: fall through (404 or fixture)

  // Refuse a legacy-shape snapshot. The cockpit can only read the readout
  // shape; rendering a legacy row would zero out every panel. Falling through
  // (404) is the honest failure for a half-onboarded customer. The legacy
  // weekly writer is also blocked from clobbering forensic customers (see
  // buildClientSnapshot), so this should only fire mid-onboarding.
  if (!isReadoutShapeSnapshot(snap.engines_breakdown, snap.top_competitors)) {
    console.warn(`customer-view: legacy-shape snapshot for "${slug}"; refusing to render zeros.`);
    return null;
  }

  let eb: Record<string, { citations: number; total: number; share_pct: number }> = {};
  let tc: { htc_venue_share_pct?: number; htc_engines_count?: number; competitors?: Array<{ domain: string; label: string; venue_share_pct: number; engines_count?: number }> } = {};
  // `|| {}` after the parse coalesces a literal "null" column (JSON.parse("null")
  // returns null) so the Object.entries / .competitors derefs below cannot throw.
  try { eb = JSON.parse(snap.engines_breakdown || "{}") || {}; } catch { /* keep empty */ }
  try { tc = JSON.parse(snap.top_competitors || "{}") || {}; } catch { /* keep empty */ }

  const perTool: ToolCount[] = Object.entries(eb)
    .map(([tool, v]) => ({ tool, shortName: TOOL_SHORT[tool] || tool, count: Number(v?.share_pct) || 0 }))
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

  // "Last measured" must reflect the HEADLINE's age, not the daily capture.
  // The headline reads from this frozen snapshot (refreshed on each monthly
  // re-bridge), so tie the freshness label to the snapshot's own date
  // (created_at = bridge time, week_start as fallback). Using
  // MAX(citation_runs.run_at) here would advance daily and falsely imply the
  // headline numbers moved today.
  const snapTs = snap.created_at || snap.week_start;
  const measuredAgo = snapTs ? agoLabel(snapTs) : "recently";

  // Observable gaps derived from the snapshot (honest, data-grounded).
  const gaps: ObservableGap[] = [];
  const copilot = eb["Microsoft Copilot"];
  const chatgpt = eb["ChatGPT search"];
  if (copilot && copilot.share_pct === 0) gaps.push({ text: "Microsoft Copilot cites you on no question (0%). It builds from the Bing index, not your live pages, so verifying your site in Bing Webmaster Tools is the lever that opens it." });
  if (chatgpt && chatgpt.share_pct > 0 && chatgpt.share_pct <= 8) gaps.push({ text: `ChatGPT search cites you on only ${chatgpt.share_pct}% of citations, your weakest web-search engine. It shares the Bing-index root with the Copilot gap, so the same fix moves both.` });
  // Fallback when no engine is at zero: say something true and useful, not a
  // jargon all-clear. The named per-question openings live in the readout.
  if (gaps.length === 0) {
    const citedCount = perTool.filter((t) => t.count > 0).length;
    const strongest = perTool[0];
    gaps.push({ text: `You are cited on ${citedCount} of 7 engines${strongest ? `, strongest on ${strongest.shortName}` : ""}. No engine sits at zero, so your opening here is share, not presence, and your monthly readout ranks which questions to push first.` });
  }

  // Derived "so-what" facts for the at-a-glance narrative. These assemble one
  // true analyst sentence the cockpit shows in place of a templated status line.
  const yourMentions = Number(snap.client_citations) || 0;
  const totalQuestions = Number(snap.total_queries) || 0;
  const myRank = cohortTop10.findIndex((r) => r.isYou) + 1;
  const cohortN = competitors.length + 1;
  const leaderShare = cohortTop10[0]?.mentions ?? ownShare;
  const iAmLeader = cohortTop10[0]?.isYou ?? false;
  const zeroNames = perTool.filter((t) => t.count === 0).map((t) => t.shortName);
  const andList = (xs: string[]): string =>
    xs.length <= 1 ? (xs[0] ?? "") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
  const baselineStartLine =
    `Your starting line: cited on ${yourMentions} of ${totalQuestions} questions` +
    (cohortN > 1
      ? `, ranked ${myRank} of ${cohortN} venues at ${ownShare}% citation share` +
        (iAmLeader ? ` (you hold the top share)` : ` (the cohort leader holds ${leaderShare}%)`)
      : ` at ${ownShare}% citation share`) +
    `. ` +
    (zeroNames.length
      ? `${zeroNames.length} of 7 engines show zero so far${zeroNames.length <= 4 ? ` (${andList(zeroNames)})` : ""}, which is where next month's work points. `
      : `You appear on all 7 engines. `) +
    `From next month, this section shows what moved against this baseline.`;

  return {
    slug,
    customerName: cust.name,
    category: cust.category_label || cust.category,
    lastMeasuredAgo: measuredAgo,
    nextMemoDate: nextMemoDate(),
    yourMentions,
    totalQuestions,
    cohortAvgMentions: cohortAvg,
    cohortRank: myRank,
    cohortSize: cohortN,
    mentionsDelta7d: 0,
    rankDelta7d: 0,
    perTool,
    changedEvents: [
      { kind: "new", whenLabel: "baseline", text: baselineStartLine },
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
    footerCadence: "Measured daily · headline refreshed with each monthly readout",
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

export function renderCustomerView(d: CustomerViewData): string {
  const baselineDelta = { className: "flat", text: "baseline · first measurement" };
  const mentionsDelta = d.isBaseline ? baselineDelta : deltaText(d.mentionsDelta7d, d.deltaSuffix);
  const rankDelta = d.isBaseline ? baselineDelta : deltaText(d.rankDelta7d, d.deltaSuffix);
  const maxToolCount = Math.max(1, ...d.perTool.map((t) => t.count));

  // Trend SVG geometry. A new customer renders on ONE baseline point; the
  // multi-point path assumes >=2, so branch explicitly (a single point must
  // draw a centered dot, no line, and one centered axis tick, not a lone
  // far-left dot with a duplicated label).
  const trendW = 800;
  const trendH = 200;
  const padX = 50;
  const onePoint = d.trend.length === 1;
  const allValues = [...d.trend.map((p) => p.yourMentions), ...d.trend.map((p) => p.cohortAvg)];
  const yMax = Math.max(8, Math.ceil(Math.max(...allValues) * 1.2));
  const xStep = (trendW - 2 * padX) / Math.max(1, d.trend.length - 1);
  const yScale = (val: number) => trendH - 30 - (val / yMax) * (trendH - 60);
  const xAt = (i: number) => onePoint ? trendW / 2 : padX + i * xStep;
  const lastYour = d.trend[d.trend.length - 1];
  const yourPoints = d.trend.map((p, i) => `${xAt(i)},${yScale(p.yourMentions)}`).join(" ");
  const avgPoints = d.trend.map((p, i) => `${xAt(i)},${yScale(p.cohortAvg)}`).join(" ");
  const trendDots = d.trend.map((p, i) => {
    const last = i === d.trend.length - 1;
    return `<circle cx="${xAt(i)}" cy="${yScale(p.yourMentions)}" r="${last ? 6 : 4}"${last ? ' stroke="#0c0b09" stroke-width="2"' : ''}/>`;
  }).join("");
  const trendPolylines = onePoint ? "" : `
          <polyline points="${yourPoints}" fill="none" stroke="#d4c596" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="${avgPoints}" fill="none" stroke="#4a4740" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>`;
  // Value labels: right-anchored along the trend, centered above the dot for a
  // single baseline point. Nudge cohort-avg down when it collides with 'you'
  // (e.g. a baseline where both are zero), so they never stack illegibly.
  const lyY = yScale(lastYour.yourMentions), caY = yScale(lastYour.cohortAvg);
  const labelX = onePoint ? trendW / 2 : trendW - 30;
  const labelAnchor = onePoint ? "middle" : "end";
  const avgLabelY = Math.abs(lyY - caY) < 14 ? caY + 16 : caY - 12;
  // Metric-aware value formatter: the D1 path plots citation SHARE (a percent),
  // the demo fixture plots question-mention counts ("of N"). Label each in its
  // own unit so a 9% share is never rendered as "9 of 18".
  const fmtMetric = (v: number): string => d.metricUnit === "%" ? `${v}% share` : `${v} of ${d.totalQuestions}`;
  const trendLabels = `
          <text x="${labelX}" y="${lyY - 12}" fill="#d4c596" font-family="ui-monospace, monospace" font-size="11" text-anchor="${labelAnchor}">you: ${fmtMetric(lastYour.yourMentions)}</text>
          <text x="${labelX}" y="${avgLabelY}" fill="#828289" font-family="ui-monospace, monospace" font-size="11" text-anchor="${labelAnchor}">cohort avg: ${fmtMetric(lastYour.cohortAvg)}</text>`;
  const trendAxis = onePoint
    ? `<text x="${trendW / 2}" y="${trendH - 5}" fill="#828289" font-family="ui-monospace, monospace" font-size="10" text-anchor="middle">${esc(d.trend[0].weekIso)}</text>`
    : `<text x="${padX}" y="${trendH - 5}" fill="#828289" font-family="ui-monospace, monospace" font-size="10">${esc(d.trend[0].weekIso)}</text>
          <text x="${trendW - padX}" y="${trendH - 5}" fill="#828289" font-family="ui-monospace, monospace" font-size="10" text-anchor="end">${esc(d.trend[d.trend.length - 1].weekIso)}</text>`;
  const trendDesc = onePoint
    ? `Baseline measured: ${fmtMetric(lastYour.yourMentions)}, versus a cohort average of ${fmtMetric(lastYour.cohortAvg)}. The trend line builds from your next monthly readout.`
    : `Your position over the window versus the cohort average. Latest: you ${fmtMetric(lastYour.yourMentions)}, cohort average ${fmtMetric(lastYour.cohortAvg)}.`;

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
    /* Warm ink, matching the readout's frozen-ledger palette. */
    --bg: #0c0b09;
    --panel: #14130e;
    --panel-light: #1b1913;
    --gold: #d4c596;
    --gold-bright: #e8c767;
    --gold-dim: #4a3d18;
    --text: #e8e8ea;
    --soft: #b9b9bd;
    --dim: #828289;
    --line: rgba(255,255,255,.07);
    --line-soft: #211e18;
    --green: #7fb88b;
    --red: #d48a8a;
    --mono: ui-monospace, "SF Mono", Menlo, monospace;
    --serif: Georgia, "Times New Roman", serif;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); }
  body { font-family: var(--serif); color: var(--text); line-height: 1.55; -webkit-font-smoothing: antialiased; position:relative; }
  /* Same warm glow as the readout header: the page is ink, not void. */
  body::before { content:""; position:absolute; top:0; left:0; right:0; height:420px; pointer-events:none;
                 background:radial-gradient(620px 300px at 50% -80px, rgba(156,138,78,.12), transparent 70%); }
  .wrap { position:relative; max-width: 1100px; margin: 0 auto; padding: 24px 22px 80px; }

  /* Top strip */
  .top {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 22px; border-bottom: 1px solid var(--line);
    margin-bottom: 32px; flex-wrap: wrap; gap: 18px;
  }
  .top-left .customer {
    font-family: var(--serif); font-size: 22px; color: var(--text);
    margin: 0 0 4px; font-weight: 400; letter-spacing: -0.01em;
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
    transition: border-color 160ms var(--ease-out), background 160ms var(--ease-out), transform 80ms var(--ease-out);
  }
  .top-msg:hover, .top-msg:focus-visible { border-color: var(--gold); background: rgba(212,197,150,0.06); }
  .top-msg:active { transform: scale(0.97); }
  .top-msg:focus-visible, .footer a:focus-visible { outline: 1px solid var(--gold); outline-offset: 3px; border-radius: 3px; }

  /* Section labels */
  .section { margin-bottom: 40px; }
  .section-label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--dim); margin-bottom: 14px;
    font-weight: 400;
  }
  .section-label .n { color: var(--gold); margin-right: 10px; }

  /* Current position card */
  .position-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .position-card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; padding: 24px 26px;
  }
  .position-card .label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--dim); margin-bottom: 10px;
  }
  .position-card .value {
    font-family: var(--serif); font-size: 36px; color: var(--gold);
    line-height: 1.1; margin-bottom: 8px;
    font-variant-numeric: tabular-nums; letter-spacing: -0.015em;
  }
  .position-card .value .denom { font-size: 18px; font-weight: 400; color: var(--dim); }
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
    top: 0; bottom: 0; background: transparent;
    border: 1px dashed #6e5d34; box-sizing: border-box;
  }
  .tool-count {
    font-family: var(--mono); font-size: 11px; color: var(--text);
    margin-top: 8px; font-variant-numeric: tabular-nums;
  }

  /* Changed list */
  .changed-list {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; padding: 4px 0;
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
    border-radius: 14px;
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
    border-radius: 14px; overflow: hidden;
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
  .cohort-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 14px; }

  /* Trend chart */
  .trend-wrap {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; padding: 24px 26px;
  }
  .trend-svg { width: 100%; height: auto; min-height: 140px; display: block; }

  /* Footer */
  .footer {
    margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line);
    font-family: var(--mono); font-size: 11px; color: var(--dim);
    letter-spacing: 0.06em; display: flex; justify-content: space-between;
    flex-wrap: wrap; gap: 18px;
  }
  .footer a { color: var(--gold); text-decoration: none; transition: color 140ms var(--ease-out); }
  .footer a:hover { color: var(--gold-bright); }
  .changed-empty { font-family: var(--serif); font-style: italic; color: var(--soft); }

  @media (max-width: 700px) {
    .wrap { padding: 18px 16px 60px; }
    .position-grid { grid-template-columns: 1fr; }
    .tool-grid { grid-template-columns: repeat(4, 1fr); }
    .tool-name { min-height: 30px; }
    table.cohort { min-width: 540px; }
    table.cohort th, table.cohort td { padding: 10px 12px; font-size: 13px; }
    .top-right { flex-direction: column; align-items: flex-start; gap: 14px; width: 100%; }
    .top-right .meta { text-align: left; }
    .top-msg { padding: 12px 16px; }
    .changed-row { flex-direction: column; gap: 8px; padding: 14px 16px; }
    .changed-icon, .changed-when { margin-top: 0; }
  }
  @media (max-width: 460px) {
    .tool-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }
</style>
</head>
<body>
  <div class="wrap">

    <!-- Header strip -->
    <div class="top">
      <div class="top-left">
        <h1 class="customer">${esc(d.customerName)}</h1>
        <div class="category">${esc(d.category)}</div>
      </div>
      <div class="top-right">
        <div class="meta">
          ${d.isBaseline ? "Baseline measured" : "Last measured"} <strong>${esc(d.lastMeasuredAgo)}</strong><br>
          Next monthly memo <strong>${esc(d.nextMemoDate)}</strong>
        </div>
        <a class="top-msg" href="/c/${esc(d.slug)}/atlas">Ask Atlas &rarr;</a>
        <a class="top-msg" href="/c/${esc(d.slug)}/readouts">Past reports &rarr;</a>
        <a class="top-msg" href="/c/${esc(d.slug)}/plan">The plan &rarr;</a>
        <a class="top-msg" href="mailto:Lance@hi.neverranked.com?subject=${encodeURIComponent(d.customerName + " - dashboard question")}">Message Lance &rarr;</a>
      </div>
    </div>

    <!-- Section 1: Current position -->
    <div class="section">
      <h2 class="section-label"><span class="n">01</span>${esc(d.positionLabel ?? "Where you are this week")}</h2>
      <div class="position-grid">
        <div class="position-card">
          <div class="label">Questions mentioning you</div>
          <div class="value">${d.yourMentions} <span class="denom">of ${d.totalQuestions}</span></div>
          <div class="delta ${mentionsDelta.className}">${esc(mentionsDelta.text)}</div>
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
          <div class="tool-bar"><div class="tool-fill${t.count === 0 ? ' zero' : ''}"${t.count === 0 ? '' : ` style="height:${Math.round((t.count / maxToolCount) * 70 + 10)}%"`}></div></div>
          <div class="tool-count">${t.count}${esc(d.metricUnit ?? "")}</div>
        </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 2: What changed in 7 days -->
    <div class="section">
      <h2 class="section-label"><span class="n">02</span>${esc(d.changedLabel ?? "What changed in the last 7 days")}</h2>
      <div class="changed-list">
        ${d.changedEvents.length === 0 ? `
          <div class="changed-row"><div class="changed-text changed-empty">${d.isBaseline ? "Your baseline is set. From next month, this is where movement against it appears." : `Nothing moved in the last 7 days. At your current rank that is the status quo holding, not progress, and your ${esc(d.nextMemoDate)} memo is where we turn these signals into moves.`}</div></div>
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
      <h2 class="section-label"><span class="n">03</span>Currently observable gaps</h2>
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
      <h2 class="section-label"><span class="n">04</span>Top 10 in your cohort</h2>
      <div class="cohort-scroll">
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
    </div>

    <!-- Section 5: Trend -->
    <div class="section">
      <h2 class="section-label"><span class="n">05</span>${esc(d.trendLabel ?? "Last 8 weeks of mention share")}</h2>
      <div class="trend-wrap">
        <svg class="trend-svg" viewBox="0 0 ${trendW} ${trendH}" role="img" aria-labelledby="trend-title trend-desc">
          <title id="trend-title">Your mention trend versus cohort average</title>
          <desc id="trend-desc">${esc(trendDesc)}</desc>
          <line x1="0" y1="40" x2="${trendW}" y2="40" stroke="#211e18" stroke-width="1"/>
          <line x1="0" y1="80" x2="${trendW}" y2="80" stroke="#211e18" stroke-width="1"/>
          <line x1="0" y1="120" x2="${trendW}" y2="120" stroke="#211e18" stroke-width="1"/>
          <line x1="0" y1="160" x2="${trendW}" y2="160" stroke="#211e18" stroke-width="1"/>${trendPolylines}
          <g fill="#d4c596">${trendDots}</g>${trendLabels}
          ${trendAxis}
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

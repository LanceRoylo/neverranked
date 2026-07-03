// Build + store the FROZEN chart data (facts_json) for a monthly report.
//
// The readout archive renders four charts from monthly_memos.facts_json. This
// derives that JSON from the customer's citation_snapshot -- the SAME source the
// cockpit and the report body use, so the charts always agree with the numbers
// in the prose. The prior month's values (for the per-engine dumbbell) come from
// the PRIOR delivered report's frozen facts_json (citation_snapshots keeps only
// the latest month), so history stays immutable and self-consistent.
//
// emitReportFacts() is called after a memo row is created (generateMemoDraft)
// and can be called for a hand-authored report too. Best-effort: any failure
// leaves the report narrative-only, never blocks delivery.

import type { Env } from "../types";
// .ts extension so the node test runner (strip-types) resolves it too; esbuild is fine with it.
import { writeAnalystNotes, type AnalystNotes } from "./report-notes.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return !y || !m || m < 1 || m > 12 ? monthKey : `${MONTHS[m - 1]} ${y}`;
}
function n(v: unknown): number { const x = Number(v); return Number.isFinite(x) ? x : 0; }

const SOURCE_LABELS: Record<string, string> = {
  independent_web: "Independent web",
  competitor: "Competitor sites",
  owned: "Your own site",
  review_directory: "Review directories",
  wikipedia: "Wikipedia",
  social: "Social",
  reddit: "Reddit",
  youtube: "YouTube",
};
function prettySource(key: string): string {
  return SOURCE_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ReportFacts {
  period_label: string;
  prior_label?: string;
  engines: Array<{ name: string; pct: number; prev?: number }>;
  venue: { rows: Array<{ label: string; pct: number; you?: boolean }> };
  sources: Array<{ label: string; pct: number; own?: boolean }>;
  topSources: Array<{ host: string; pct: number }>;
  /** Question-level movement: where the customer got newly cited (or stopped
   *  being cited) by a specific engine this window vs the prior one. The
   *  month-2 "wins" layer: concrete movement even when aggregates are flat. */
  questions?: {
    appeared: Array<{ q: string; engines: string[] }>;
    disappeared: Array<{ q: string; engines: string[] }>;
  };
  /** Per-chart "The read this month" analyst commentary (frozen with the numbers). */
  notes?: AnalystNotes;
}

/** Per-question, per-engine cited-at-all flips between the prior and current
 *  30-day windows. Requires runs in BOTH windows (a baseline month has no
 *  prior window, so this returns undefined and the section never renders). */
async function buildQuestionMovement(env: Env, slug: string): Promise<ReportFacts["questions"]> {
  const DAY = 86400;
  const nowTs = Math.floor(Date.now() / 1000);
  const curStart = nowTs - 30 * DAY;
  const priorStart = nowTs - 60 * DAY;
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.run_at, ck.keyword
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ?`,
  ).bind(slug, priorStart).all<{ engine: string; client_cited: number; run_at: number; keyword: string }>();

  // key = question \u0000 engine -> cited-at-all per window
  const cur = new Map<string, boolean>(), pri = new Map<string, boolean>();
  let curCount = 0, priCount = 0;
  for (const r of runs.results) {
    const key = `${r.keyword}\u0000${r.engine}`;
    const m = r.run_at >= curStart ? (curCount++, cur) : (priCount++, pri);
    m.set(key, (m.get(key) || false) || r.client_cited === 1);
  }
  if (!curCount || !priCount) return undefined; // baseline month: nothing to compare

  const appeared = new Map<string, string[]>(), disappeared = new Map<string, string[]>();
  for (const [key, was] of pri) {
    if (!cur.has(key)) continue; // engine not measured this window: not a flip
    const [q, engine] = key.split("\u0000");
    const is = cur.get(key)!;
    if (is && !was) (appeared.get(q) ?? appeared.set(q, []).get(q)!).push(engine);
    else if (!is && was) (disappeared.get(q) ?? disappeared.set(q, []).get(q)!).push(engine);
  }
  const pack = (m: Map<string, string[]>) =>
    [...m.entries()].map(([q, engines]) => ({ q, engines: engines.sort() }))
      .sort((a, b) => b.engines.length - a.engines.length).slice(0, 6);
  const out = { appeared: pack(appeared), disappeared: pack(disappeared) };
  return out.appeared.length || out.disappeared.length ? out : undefined;
}

/** Derive the report's chart facts from the customer's latest snapshot + the
 *  prior delivered report's facts (for per-engine deltas). null if no snapshot. */
export async function buildReportFacts(env: Env, slug: string, monthKey: string): Promise<ReportFacts | null> {
  const snap = await env.DB.prepare(
    `SELECT engines_breakdown, top_competitors FROM citation_snapshots
       WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
  ).bind(slug).first<{ engines_breakdown: string; top_competitors: string }>();
  if (!snap) return null;

  let eb: Record<string, { share_pct?: number }> = {};
  let tc: {
    htc_venue_share_pct?: number;
    competitors?: Array<{ label?: string; domain?: string; venue_share_pct?: number }>;
    source_types?: Record<string, { share_pct?: number }>;
    offsite_hosts?: Array<{ host?: string; share_pct?: number }>;
  } = {};
  try { eb = JSON.parse(snap.engines_breakdown) || {}; } catch { return null; }
  try { tc = JSON.parse(snap.top_competitors) || {}; } catch { /* venue/sources optional */ }

  const cust = await env.DB.prepare(`SELECT name FROM customers WHERE client_slug = ?`).bind(slug).first<{ name: string }>();
  const customerName = cust?.name || "You";

  // Prior delivered report's engine values, for the dumbbell's "from" dots.
  const prior = await env.DB.prepare(
    `SELECT month_key, facts_json FROM monthly_memos
       WHERE client_slug = ? AND delivered_at IS NOT NULL AND month_key < ? AND facts_json IS NOT NULL
       ORDER BY month_key DESC LIMIT 1`,
  ).bind(slug, monthKey).first<{ month_key: string; facts_json: string }>();
  const priorEngines = new Map<string, number>();
  let priorLabel: string | undefined;
  if (prior?.facts_json) {
    try {
      const pf = JSON.parse(prior.facts_json) as ReportFacts;
      priorLabel = monthLabel(prior.month_key);
      for (const e of pf.engines || []) if (e && typeof e.name === "string") priorEngines.set(e.name, n(e.pct));
    } catch { /* no prior */ }
  }

  const engines = Object.entries(eb).map(([name, v]) => {
    const row: { name: string; pct: number; prev?: number } = { name, pct: n(v?.share_pct) };
    if (priorEngines.has(name)) row.prev = priorEngines.get(name);
    return row;
  });

  const venueRows: Array<{ label: string; pct: number; you?: boolean }> = [
    { label: customerName, pct: n(tc.htc_venue_share_pct), you: true },
    ...(tc.competitors || []).filter((c) => c && (c.label || c.domain)).map((c) => ({ label: String(c.label || c.domain), pct: n(c.venue_share_pct) })),
  ];

  const sources = Object.entries(tc.source_types || {})
    .map(([k, v]) => ({ label: prettySource(k), pct: n(v?.share_pct), own: k === "owned" }))
    .sort((a, b) => b.pct - a.pct);

  const topSources = (tc.offsite_hosts || [])
    .filter((h) => h && typeof h.host === "string")
    .map((h) => ({ host: String(h.host), pct: n(h.share_pct) }));

  // Question-level appeared/disappeared (defensive: absent on any failure).
  let questions: ReportFacts["questions"];
  try { questions = await buildQuestionMovement(env, slug); } catch { questions = undefined; }

  return {
    period_label: monthLabel(monthKey),
    prior_label: priorLabel,
    engines,
    venue: { rows: venueRows },
    sources,
    topSources,
    ...(questions ? { questions } : {}),
  };
}

/** Build the facts and store them on the report row. Best-effort; never throws. */
export async function emitReportFacts(env: Env, slug: string, monthKey: string): Promise<boolean> {
  try {
    const facts = await buildReportFacts(env, slug, monthKey);
    if (!facts || !facts.engines.length) return false;

    // Analyst notes ("The read this month") — generated from the frozen facts
    // and frozen alongside them. Best-effort: {} on any failure, and the
    // number check inside drops any note that mentions an unmeasured figure.
    const cust = await env.DB.prepare(
      `SELECT name, category_label FROM customers WHERE client_slug = ?`,
    ).bind(slug).first<{ name: string; category_label: string | null }>();
    const notes = await writeAnalystNotes(env, facts, { name: cust?.name || "You", category_label: cust?.category_label });
    if (Object.keys(notes).length) facts.notes = notes;
    await env.DB.prepare(
      `UPDATE monthly_memos SET facts_json = ?, updated_at = ? WHERE client_slug = ? AND month_key = ?`,
    ).bind(JSON.stringify(facts), Math.floor(Date.now() / 1000), slug, monthKey).run();
    return true;
  } catch (e) {
    console.log(`[report-facts] emit failed for ${slug}/${monthKey}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

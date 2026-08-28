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
import { isReadoutShapeSnapshot } from "./snapshot-shape.ts";
import { ENGINE_ORDER } from "./engine-order";

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
  // noCohortSignal: the engine returned citations but NOT ONE went to any
  // venue in the cohort -- not the customer, not a single competitor. That
  // is an engine-level absence, not a visibility failure, and must never
  // render as a plain 0% the customer might try to fix. Absent on
  // snapshots written before 2026-08-03, which render as before.
  engines: Array<{ name: string; pct: number; prev?: number; noCohortSignal?: boolean }>;
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
  /** Per-engine x per-question citation grid for the report month. The finest
   *  grain we hold: for each tracked question and each AI tool, the share of the
   *  month's runs in which the customer was cited. Built ONLY from
   *  citation_runs.client_cited (the same trusted source as `questions`), so no
   *  competitor-name matching and nothing to get factually wrong. Absent when
   *  the month has too little data to be worth showing. */
  grid?: {
    engines: string[];          // row labels, canonical 5+2 order, only tools that ran
    questions: string[];        // column labels (tracked keywords), stable order
    /** cells[engineIdx][questionIdx]: fraction 0..1 of that tool's runs on that
     *  question where the customer was cited, or -1 if the tool never answered
     *  that question this month (no run = no claim). */
    cells: number[][];
  };
  /** Per-chart "The read this month" analyst commentary (frozen with the numbers). */
  notes?: AnalystNotes;
}

// citation_runs.engine holds raw keys; map to the canonical 5+2 display order.
// The list lives in lib/engine-order.ts because it was previously duplicated
// here and in routes/customer-view.ts, and the two copies drifted from the
// writer: both spelled Google AI Overviews `google_aio` while the runner
// inserts `google_ai_overview`, so the engine silently vanished from this
// grid (HTC's delivered August 2026 report has six).
const GRID_ENGINE_ORDER = ENGINE_ORDER;

/** Raw citation_runs.engine key -> the label customers see. */
const ENGINE_LABEL_BY_KEY = new Map(ENGINE_ORDER.map((e) => [e.key, e.label]));

/** [start, end) epoch seconds for a 'YYYY-MM' month, plus the prior month's
 *  start. Date.UTC normalizes month under/overflow (Jan -> prior December). */
function monthBounds(monthKey: string): { start: number; end: number; priorStart: number } | null {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return {
    start: Math.floor(Date.UTC(y, m - 1, 1) / 1000),
    end: Math.floor(Date.UTC(y, m, 1) / 1000),
    priorStart: Math.floor(Date.UTC(y, m - 2, 1) / 1000),
  };
}


/** Per-engine collection completeness for a window.
 *
 *  WHY THIS EXISTS (2026-08-28): nothing in this file asked whether an engine
 *  actually ran enough to support a claim about it. An engine that collected
 *  9% of the month's questions rendered identically to one that collected
 *  100%. Because every aggregate here is cited-at-all with an OR, a missing
 *  row can only ever produce a FALSE NEGATIVE -- the report says a question
 *  lost ChatGPT visibility when the truth is nobody asked ChatGPT. Reporting
 *  under-collection as lost visibility is the worst failure this product has.
 *
 *  The measure is coverage RELATIVE TO WHAT WAS ASKED, not against an
 *  expected count. Every engine is put the same question set, so the number
 *  of distinct questions any engine answered is the best available proxy for
 *  "questions actually run this window". That sidesteps the fact that
 *  skipReason() deliberately writes no row when an engine returns a genuine
 *  empty answer: we cannot tell "had nothing to say" from "was never asked",
 *  and for reporting purposes we do not need to. Either way we hold no data
 *  for that engine on that question and must not imply otherwise.
 *
 *  Threshold is deliberately loose. Google AI Overviews legitimately fails to
 *  render on a large minority of questions, and excluding it for that would
 *  be wrong. 50% catches a collapse without punishing an engine that is
 *  merely quiet.
 */
const MIN_ENGINE_COVERAGE = 0.5;

export type EngineCoverage = {
  engine: string;
  questionsCovered: number;
  questionsAsked: number;
  pct: number;
  sufficient: boolean;
};

async function assessEngineCoverage(
  env: Env,
  slug: string,
  startTs: number,
  endTs: number,
): Promise<EngineCoverage[]> {
  const rows = (await env.DB.prepare(
    `SELECT cr.engine AS engine, COUNT(DISTINCT ck.keyword) AS qs
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
      GROUP BY cr.engine`,
  ).bind(slug, startTs, endTs).all<{ engine: string; qs: number }>()).results;

  // "Asked" = the most questions any single engine covered this window. Not a
  // sum and not a guess at the roster: the engine that saw the most questions
  // defines what was actually put to the panel.
  const asked = rows.reduce((m, r) => Math.max(m, Number(r.qs) || 0), 0);
  if (!asked) return [];

  return rows.map((r) => {
    const covered = Number(r.qs) || 0;
    const pct = covered / asked;
    return {
      engine: String(r.engine),
      questionsCovered: covered,
      questionsAsked: asked,
      pct,
      sufficient: pct >= MIN_ENGINE_COVERAGE,
    };
  });
}

/** Per-question, per-engine cited-at-all flips between the report's month and
 *  the month before it. Windows are anchored to monthKey (NOT Date.now()) so a
 *  late-emitted or backfilled report reflects the month it is labeled. Requires
 *  runs in BOTH windows (a baseline month has no prior window, so this returns
 *  undefined and the section never renders). */
async function buildQuestionMovement(env: Env, slug: string, monthKey: string): Promise<ReportFacts["questions"]> {
  const b = monthBounds(monthKey);
  if (!b) return undefined;
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.run_at, ck.keyword
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
  ).bind(slug, b.priorStart, b.end).all<{ engine: string; client_cited: number; run_at: number; keyword: string }>();

  // Movement compares two windows, so an engine must have collected
  // adequately in BOTH. An engine healthy last month and collapsed this
  // month would otherwise render every one of its questions as
  // "disappeared" -- lost visibility that never happened. That is the
  // exact false negative this guard exists to prevent.
  const curCov = await assessEngineCoverage(env, slug, b.start, b.end);
  const priCov = await assessEngineCoverage(env, slug, b.priorStart, b.start);
  const okCur = new Set(curCov.filter((c) => c.sufficient).map((c) => c.engine));
  const okPri = new Set(priCov.filter((c) => c.sufficient).map((c) => c.engine));
  const trusted = new Set([...okCur].filter((e) => okPri.has(e)));
  for (const c of curCov) {
    if (!trusted.has(c.engine)) {
      console.log(`[report-facts] ${slug} ${monthKey}: EXCLUDING ${c.engine} from question movement -- covered ${c.questionsCovered}/${c.questionsAsked} questions this window (${Math.round(c.pct * 100)}%). Under-collection must not render as lost visibility.`);
    }
  }

  // key = question \u0000 engine -> cited-at-all per window
  const cur = new Map<string, boolean>(), pri = new Map<string, boolean>();
  let curCount = 0, priCount = 0;
  for (const r of runs.results) {
    if (!trusted.has(r.engine)) continue; // under-collected: no claim either way
    const key = `${r.keyword}\u0000${r.engine}`;
    const m = r.run_at >= b.start ? (curCount++, cur) : (priCount++, pri);
    m.set(key, (m.get(key) || false) || r.client_cited === 1);
  }
  if (!curCount || !priCount) return undefined; // baseline month: nothing to compare

  const appeared = new Map<string, string[]>(), disappeared = new Map<string, string[]>();
  for (const [key, was] of pri) {
    if (!cur.has(key)) continue; // engine not measured this window: not a flip
    const [q, engine] = key.split("\u0000");
    const is = cur.get(key)!;
    // Label, not raw key. citation_runs.engine holds "bing" and
    // "google_ai_overview"; the grid beside these chips renders "Copilot" and
    // "Google AIO" off the same rows, so emitting the raw key put two
    // vocabularies for one tool in a single customer-facing report.
    // Unknown keys pass through rather than vanish: ENGINE_ORDER is tested
    // against the runner's own INSERTs, so an unmapped key means a new engine
    // nobody registered, and that should be visible, not silently dropped.
    const eng = ENGINE_LABEL_BY_KEY.get(engine) ?? engine;
    if (is && !was) (appeared.get(q) ?? appeared.set(q, []).get(q)!).push(eng);
    else if (!is && was) (disappeared.get(q) ?? disappeared.set(q, []).get(q)!).push(eng);
  }
  const pack = (m: Map<string, string[]>) =>
    [...m.entries()].map(([q, engines]) => ({ q, engines: engines.sort() }))
      .sort((a, b) => b.engines.length - a.engines.length).slice(0, 6);
  const out = { appeared: pack(appeared), disappeared: pack(disappeared) };
  return out.appeared.length || out.disappeared.length ? out : undefined;
}

/** Per-engine x per-question citation grid for the report month. Reads the
 *  same citation_runs source as buildQuestionMovement (client_cited only), so
 *  it carries no competitor-name-matching risk and can never freeze a wrong
 *  competitive claim into an immutable report. Fail-closed: returns undefined
 *  unless there is enough real data to be worth a grid (>=2 tools and >=3
 *  questions that actually ran this month). */
async function buildCitationGrid(env: Env, slug: string, monthKey: string): Promise<ReportFacts["grid"]> {
  const b = monthBounds(monthKey);
  if (!b) return undefined;
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, ck.keyword
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
  ).bind(slug, b.start, b.end).all<{ engine: string; client_cited: number; keyword: string }>();
  if (!runs.results.length) return undefined;

  // Same guard as question movement. A grid cell reading 0% for an engine
  // that only ran 2 of 22 questions is not a measurement, it is an absence
  // dressed as one.
  const cov = await assessEngineCoverage(env, slug, b.start, b.end);
  const gridTrusted = new Set(cov.filter((c) => c.sufficient).map((c) => c.engine));
  for (const c of cov) {
    if (!gridTrusted.has(c.engine)) {
      console.log(`[report-facts] ${slug} ${monthKey}: EXCLUDING ${c.engine} from citation grid -- covered ${c.questionsCovered}/${c.questionsAsked} questions (${Math.round(c.pct * 100)}%).`);
    }
  }

  // tally[engineKey][keyword] = { cited, total }
  const tally = new Map<string, Map<string, { cited: number; total: number }>>();
  const questionSet = new Set<string>();
  for (const r of runs.results) {
    if (typeof r.engine !== "string" || typeof r.keyword !== "string") continue;
    if (!gridTrusted.has(r.engine)) continue; // under-collected
    questionSet.add(r.keyword);
    let byQ = tally.get(r.engine);
    if (!byQ) { byQ = new Map(); tally.set(r.engine, byQ); }
    const cell = byQ.get(r.keyword) ?? { cited: 0, total: 0 };
    cell.total++;
    if (r.client_cited === 1) cell.cited++;
    byQ.set(r.keyword, cell);
  }

  // Rows: canonical 5+2 order, only tools that actually ran this month.
  const engineRows = GRID_ENGINE_ORDER.filter((e) => tally.has(e.key));
  // Columns: keywords in a stable order (sorted) so the grid is deterministic.
  const questions = [...questionSet].sort();
  if (engineRows.length < 2 || questions.length < 3) return undefined; // too thin to be worth it

  const cells = engineRows.map((e) => {
    const byQ = tally.get(e.key)!;
    return questions.map((q) => {
      const cell = byQ.get(q);
      if (!cell || cell.total === 0) return -1; // tool never answered this question this month
      return cell.cited / cell.total;
    });
  });

  return { engines: engineRows.map((e) => e.label), questions, cells };
}

/** Derive the report's chart facts from the customer's latest snapshot + the
 *  prior delivered report's facts (for per-engine deltas). null if no snapshot. */
export async function buildReportFacts(env: Env, slug: string, monthKey: string): Promise<ReportFacts | null> {
  const snap = await env.DB.prepare(
    `SELECT engines_breakdown, top_competitors, week_start, measured_at FROM citation_snapshots
       WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
  ).bind(slug).first<{ engines_breakdown: string; top_competitors: string; week_start: number; measured_at: number | null }>();
  if (!snap) return null;

  // Refuse a legacy-shape (weekly auto-writer) snapshot: its engines_breakdown
  // has no share_pct, so every chart would freeze all-zero into a delivered,
  // immutable report. Match the fail-closed guard the cockpit/memo readers use.
  if (!isReadoutShapeSnapshot(snap.engines_breakdown, snap.top_competitors)) {
    console.log(`[report-facts] legacy-shape snapshot for ${slug}/${monthKey}; skipping facts (report stays narrative-only)`);
    return null;
  }

  // Refuse a snapshot that is NEWER than the report's month. citation_snapshots
  // holds only the latest month (it is overwritten), so emitting/backfilling an
  // older report late would otherwise freeze a newer month's numbers under an
  // older label. Fail closed: narrative-only rather than mislabeled data.
  const mb = monthBounds(monthKey);
  if (mb && typeof snap.week_start === "number" && snap.week_start >= mb.end) {
    console.log(`[report-facts] latest snapshot for ${slug} is newer than report month ${monthKey}; skipping facts to avoid wrong-month data`);
    return null;
  }

  // Refuse a snapshot whose MEASUREMENT is too old for the report's month.
  //
  // monthKey is the DELIVERY month, not the data month -- memo-generator.ts
  // instructs the model to "Title the memo and its opening H2 by the DELIVERY
  // month. Do not date it by the month the data falls in." So data always
  // predates its label by design, and a same-month rule would fail closed on
  // every correct report (HTC's August report carries data measured July 31).
  //
  // The real failure is degree, not kind: one month back is the cadence,
  // three months back is a stale snapshot wearing a fresh date. The bound is
  // therefore the start of the month BEFORE the delivery month.
  //
  // week_start cannot answer this. Every writer stamps it with the Monday of
  // the week it RAN (citations.ts:1010, :1486, bridge-to-d1.mjs:188), so
  // prince-waikiki's June 26 measurement carries week_start 2026-08-17. The
  // measurement date lives in measured_at (migration 0106).
  //
  // NULL measured_at means the row cannot prove when it was measured, which
  // is not a reason to trust it. Fail closed, same as every guard above.
  if (mb && (typeof snap.measured_at !== "number" || snap.measured_at < mb.priorStart)) {
    const seen = typeof snap.measured_at === "number"
      ? new Date(snap.measured_at * 1000).toISOString().slice(0, 10)
      : "unknown";
    console.log(`[report-facts] snapshot for ${slug} was measured ${seen}, too stale for report month ${monthKey}; skipping facts (report stays narrative-only)`);
    return null;
  }

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
    const row: { name: string; pct: number; prev?: number; noCohortSignal?: boolean } = { name, pct: n(v?.share_pct) };
    if (priorEngines.has(name)) row.prev = priorEngines.get(name);
    // Only assert this when the bridge actually measured it. An older
    // snapshot without cohort_citations stays silent rather than guessing.
    const cc = (v as { cohort_citations?: number } | undefined)?.cohort_citations;
    const tot = (v as { total?: number } | undefined)?.total;
    if (typeof cc === "number" && cc === 0 && typeof tot === "number" && tot > 0) {
      row.noCohortSignal = true;
    }
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
  try { questions = await buildQuestionMovement(env, slug, monthKey); } catch { questions = undefined; }

  // Per-engine x per-question citation grid (defensive: absent on any failure).
  let grid: ReportFacts["grid"];
  try { grid = await buildCitationGrid(env, slug, monthKey); } catch { grid = undefined; }

  return {
    period_label: monthLabel(monthKey),
    prior_label: priorLabel,
    engines,
    venue: { rows: venueRows },
    sources,
    topSources,
    ...(questions ? { questions } : {}),
    ...(grid ? { grid } : {}),
  };
}

/** Build the facts and store them on the report row. Best-effort; never throws. */
export async function emitReportFacts(env: Env, slug: string, monthKey: string): Promise<boolean> {
  try {
    // Immutability: a delivered report's frozen facts are never rewritten.
    // Skip early so undeliver/redeliver, backfills, or a generation race can't
    // silently change numbers a customer already received (and so we don't burn
    // an LLM call regenerating notes for a report that is already final).
    const existing = await env.DB.prepare(
      `SELECT delivered_at, facts_json FROM monthly_memos WHERE client_slug = ? AND month_key = ?`,
    ).bind(slug, monthKey).first<{ delivered_at: number | null; facts_json: string | null }>();
    // Delivered is delivered. The old condition also required facts_json to be
    // non-null, which let a DELIVERED narrative-only report acquire charts
    // afterwards -- hawaii-theatre's August 2026 report was delivered
    // 08-03 20:08 and had facts written 08-04 07:49, under a readout footer
    // that promises the numbers do not change after delivery. A report gaining
    // four charts overnight is exactly the change that footer rules out.
    if (existing && existing.delivered_at != null) return false;

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
    // Race backstop: refuses to write a row that was delivered between the
    // check above and here. Must match that check exactly -- the old
    // `(delivered_at IS NULL OR facts_json IS NULL)` was strictly weaker and
    // was itself the hole, inviting the write it was meant to block.
    await env.DB.prepare(
      `UPDATE monthly_memos SET facts_json = ?, updated_at = ?
        WHERE client_slug = ? AND month_key = ? AND delivered_at IS NULL`,
    ).bind(JSON.stringify(facts), Math.floor(Date.now() / 1000), slug, monthKey).run();
    return true;
  } catch (e) {
    console.log(`[report-facts] emit failed for ${slug}/${monthKey}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

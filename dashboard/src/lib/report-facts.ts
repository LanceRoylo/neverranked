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
import { resolveEngineKey } from "./engine-order";
import { snapshotUsableForMonth } from "./snapshot-selection";
import { engineLayer, type EngineLayer } from "./engine-layer";
import { resolveBusinessName, nameMatches } from "../citations";
import type { InjectionConfig } from "../types";

/** Did a model-knowledge run NAME the business? Reads the entities the model
 *  emitted rather than client_cited, which is URL-derived and was 0 on every
 *  model-knowledge row until resolveBusinessName landed. */
function namedIn(citedEntities: string, businessName: string): boolean {
  try {
    const ents = JSON.parse(citedEntities || "[]") as Array<{ name?: string }>;
    return ents.some((e) => typeof e?.name === "string" && nameMatches(e.name, businessName));
  } catch {
    return false;
  }
}
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
  /** `layer` says WHICH MEASUREMENT produced `pct`, and the renderer must not
   *  put the two in one chart. Per the published methodology, a citation-grade
   *  tool's pct is the share of its CITED URLS pointing to the customer, while
   *  a model-knowledge tool's is the share of its ANSWERS that name them. The
   *  bar caption "the share of that AI tool's citations that point to your own
   *  site" is simply false for Claude and Gemma.
   *  Absent on snapshots written by the forensic bridge, which does not record
   *  it. Those render as "citation", preserving hawaii-theatre exactly. */
  engines: Array<{
    name: string;
    pct: number;
    prev?: number;
    noCohortSignal?: boolean;
    layer?: "citation" | "model_knowledge";
  }>;
  /** Surfaces held out of this report, with the reason, so the customer sees
   *  WHY a tool is missing instead of inferring it was never measured. A
   *  silent omission from a measurement report is its own failure: the reader
   *  cannot tell a measured zero from an engine we could not collect. */
  excludedEngines?: Array<{ name: string; reason: string }>;
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
  /** Per-engine x per-question grid for the report month. The finest grain we
   *  hold: for each tracked question and each AI tool, the share of the month's
   *  runs in which the customer appeared.
   *
   *  "APPEARED" MEANS DIFFERENT THINGS PER ROW, which the old version of this
   *  comment denied ("built ONLY from client_cited ... nothing to get factually
   *  wrong"). Layer 1 rows are CITED: a URL of theirs was among the sources.
   *  Layer 2 rows are NAMED: the model said the business name and cited
   *  nothing, because those tools cite nothing at all. Rendering both as
   *  "cited" is the same cross-layer claim the prose guard and the Atlas
   *  context exist to prevent.
   *
   *  Layer 2 cells are computed from cited_entities and the business name, not
   *  from client_cited. That flag depends on a resolvable business name, and
   *  before resolveBusinessName landed it was 0 on every model-knowledge row
   *  no matter what the model said: 40 September runs named this customer and
   *  every one was flagged uncited. Reading the entities is correct for rows
   *  already written as well as rows still to come. */
  grid?: {
    engines: string[];          // row labels, canonical 5+2 order, only tools that ran
    /** Per row, aligned with `engines`. "citation" rows were CITED,
     *  "model_knowledge" rows were NAMED. The renderer must not call both
     *  the same thing. */
    layers: EngineLayer[];
    questions: string[];        // column labels (tracked keywords), stable order
    /** cells[engineIdx][questionIdx]: fraction 0..1 of that tool's runs on that
     *  question where the customer appeared on that row's terms, or -1 if the
     *  tool never answered that question this month (no run = no claim). */
    cells: number[][];
    /** counts[engineIdx][questionIdx]: how many runs that fraction rests on.
     *
     *  A share carries no evidence of its own weight. In September one tool
     *  answered 5 questions exactly ONCE while its neighbours answered every
     *  question 8 to 13 times, and both rendered identically: a flat 0% or a
     *  flat 100% either way. Same picture, a 13x difference in what stands
     *  behind it. The renderer uses this to draw thin cells smaller. */
    counts: number[][];
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

/** A surface can answer every question once and still be missing most of its
 *  observations, and the distinct-question measure above cannot see it.
 *
 *  MEASURED on a real client month. The slug and the month are deliberately
 *  not named here: this repo is public. Per-client figures live in the
 *  private docs repo. The SHAPE is the point:
 *
 *      engine               distinct Qs   observations   density
 *      perplexity                 30/30            384      100%
 *      gemini                     30/30            384      100%
 *      google_ai_overview         27/30            162       42%
 *      openai                     30/30            158       41%
 *
 *  OpenAI answered all 30 questions at some point in the month (two healthy
 *  days were enough), so it scored 100% coverage and passed this guard
 *  cleanly -- while holding 41% of the chances to show a citation that its
 *  peers had. An engine with fewer draws shows fewer citations, and the
 *  report would have read that as the client losing ChatGPT visibility. That
 *  is precisely the false negative this file calls the worst failure this
 *  product has, produced by the guard written to prevent it.
 *
 *  Density alone cannot be the test: AIO sits at 42% too and is perfectly
 *  healthy, because it legitimately declines to render. The discriminator is
 *  engine_failures, which we already record: in that same window openai
 *  logged 493 refusals and AIO logged ZERO. Same number, opposite meaning.
 *  An absence explained by logged refusals is under-collection; an absence
 *  with no refusals behind it is an engine that had nothing to say. */
const MIN_ENGINE_DENSITY = 0.5;

/** Refusals needed before they can explain a shortfall. One transient 429 must
 *  not condemn a surface sitting just under the density line. */
const MIN_FAILURES_TO_BLAME = 10;

export type EngineCoverage = {
  engine: string;
  questionsCovered: number;
  questionsAsked: number;
  pct: number;
  /** Rows this engine actually produced in the window. */
  observations: number;
  /** Rows the busiest engine produced, i.e. what a healthy surface collected. */
  observationsExpected: number;
  /** observations / observationsExpected. How OFTEN it answered, as opposed to
   *  whether it ever did. */
  density: number;
  /** Density is short AND recorded API refusals explain it. */
  underCollected: boolean;
  sufficient: boolean;
};

/** Coverage assessed from the rows the caller ALREADY fetched, not from a
 *  second query.
 *
 *  This is deliberate. A separate GROUP BY over the same JOIN can disagree
 *  with the rows being filtered -- different window arithmetic, a schema
 *  change applied to one query and not the other -- and a guard that
 *  disagrees with the data it guards is worse than no guard: it excludes
 *  engines the report has real data for. Deriving from the same array makes
 *  divergence impossible, removes three DB round-trips per readout, and lets
 *  the guard be tested with the fixtures that already exist. */
export function assessEngineCoverage(
  rows: Array<{ engine: string; keyword: string }>,
  /** Recorded API refusals per engine over the SAME window, from
   *  engine_failures. Optional on purpose: when it is absent the
   *  under-collection test cannot be evaluated and is skipped rather than
   *  guessed, which preserves this file's rule that a guard must never be able
   *  to erase a report by malfunctioning. */
  failuresByEngine?: Map<string, number>,
): EngineCoverage[] {
  const byEngine = new Map<string, Set<string>>();
  const obsByEngine = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.engine !== "string" || typeof r.keyword !== "string") continue;
    let qs = byEngine.get(r.engine);
    if (!qs) { qs = new Set(); byEngine.set(r.engine, qs); }
    qs.add(r.keyword);
    obsByEngine.set(r.engine, (obsByEngine.get(r.engine) ?? 0) + 1);
  }

  // "Asked" = the most questions any single engine covered this window. Not a
  // sum and not a guess at the roster: the engine that saw the most questions
  // defines what was actually put to the panel.
  let asked = 0;
  for (const qs of byEngine.values()) asked = Math.max(asked, qs.size);
  if (!asked) return [];

  // Same logic one level down: the busiest engine defines how often the panel
  // was actually put to work.
  let expected = 0;
  for (const n of obsByEngine.values()) expected = Math.max(expected, n);

  return [...byEngine.entries()].map(([engine, qs]) => {
    const pct = qs.size / asked;
    const observations = obsByEngine.get(engine) ?? 0;
    const density = expected > 0 ? observations / expected : 0;
    const failures = failuresByEngine?.get(engine) ?? 0;
    const underCollected =
      failuresByEngine !== undefined &&
      density < MIN_ENGINE_DENSITY &&
      failures >= MIN_FAILURES_TO_BLAME;
    return {
      engine,
      questionsCovered: qs.size,
      questionsAsked: asked,
      pct,
      observations,
      observationsExpected: expected,
      density,
      underCollected,
      sufficient: pct >= MIN_ENGINE_COVERAGE && !underCollected,
    };
  });
}

/** Refusals per engine in a window, for the under-collection test above.
 *
 *  Fetched by the caller and passed IN rather than queried inside the
 *  assessor, so the assessor stays a pure function of the rows it guards.
 *  Never throws: a telemetry table being unavailable must degrade the guard to
 *  its previous behaviour, not take down a readout. */
export async function fetchEngineFailureCounts(
  env: Env,
  startTs: number,
  endTs: number,
): Promise<Map<string, number> | undefined> {
  try {
    const r = await env.DB.prepare(
      `SELECT engine, COUNT(*) AS n FROM engine_failures
        WHERE failed_at >= ? AND failed_at < ? GROUP BY engine`,
    ).bind(startTs, endTs).all<{ engine: string; n: number }>();
    const m = new Map<string, number>();
    for (const row of r.results) {
      if (typeof row.engine === "string") m.set(row.engine, Number(row.n) || 0);
    }
    return m;
  } catch (e) {
    console.log(`[report-facts] engine_failures unavailable; under-collection test skipped: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

/** Epoch seconds at which CONTRACTED measurement begins, or null.
 *
 *  Pre-engagement rows are real measurements, but they are not the
 *  engagement. A sales teardown and a dry run both write to citation_runs,
 *  and nothing downstream could tell them from a contracted month. NULL means
 *  "no start recorded", which preserves the pre-2026-08-29 behaviour. */
async function getMeasurementStart(env: Env, slug: string): Promise<number | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT measurement_start FROM measurement_registry WHERE client_slug = ?`,
    ).bind(slug).first<{ measurement_start: number | null }>();
    const v = Number(row?.measurement_start);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null; // column absent (pre-migration): behave as before
  }
}

/** Per-question, per-engine cited-at-all flips between the report's month and
 *  the month before it. Windows are anchored to monthKey (NOT Date.now()) so a
 *  late-emitted or backfilled report reflects the month it is labeled. Requires
 *  runs in BOTH windows (a baseline month has no prior window, so this returns
 *  undefined and the section never renders). */
async function buildQuestionMovement(env: Env, slug: string, monthKey: string, measurementStart: number | null): Promise<ReportFacts["questions"]> {
  const b = monthBounds(monthKey);
  if (!b) return undefined;
  // A prior month that predates the engagement is not a prior month. Returning
  // undefined here is the CORRECT answer for a client's first month: it is a
  // baseline, and a baseline has nothing to have moved from.
  if (measurementStart !== null && b.priorStart < measurementStart) {
    console.log(`[report-facts] ${slug} ${monthKey}: prior window opens before contracted measurement start; treating as BASELINE (no movement section).`);
    return undefined;
  }
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.run_at, ck.keyword
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
  ).bind(slug, Math.max(b.priorStart, measurementStart ?? 0), b.end).all<{ engine: string; client_cited: number; run_at: number; keyword: string }>();

  // Movement compares two windows, so an engine must have collected
  // adequately in BOTH. An engine healthy last month and collapsed this
  // month would otherwise render every one of its questions as
  // "disappeared" -- lost visibility that never happened. That is the
  // exact false negative this guard exists to prevent.
  // Refusals are fetched per window, matching each coverage assessment, so a
  // surface that was refused this month but healthy last month is judged
  // against the right evidence in each.
  const curFails = await fetchEngineFailureCounts(env, b.start, b.end);
  const priFails = await fetchEngineFailureCounts(env, b.priorStart, b.start);
  const curCov = assessEngineCoverage(runs.results.filter((r) => r.run_at >= b.start), curFails);
  const priCov = assessEngineCoverage(runs.results.filter((r) => r.run_at < b.start), priFails);
  // If coverage cannot be assessed at all, do NOT filter. An empty
  // assessment would otherwise exclude every engine and silently blank the
  // section -- a worse failure than the one this guard prevents, and a NEW
  // one. A guard must never be able to erase a report by malfunctioning.
  // Degrade to pre-guard behaviour and say so.
  const coverageUsable = curCov.length > 0 && priCov.length > 0;
  if (!coverageUsable) {
    console.log(`[report-facts] ${slug} ${monthKey}: engine coverage unassessable (cur=${curCov.length}, prior=${priCov.length}); question movement NOT filtered.`);
  }
  const okCur = new Set(curCov.filter((c) => c.sufficient).map((c) => c.engine));
  const okPri = new Set(priCov.filter((c) => c.sufficient).map((c) => c.engine));
  const trusted = new Set([...okCur].filter((e) => okPri.has(e)));
  const trust = (engine: string) => !coverageUsable || trusted.has(engine);
  for (const c of coverageUsable ? curCov : []) {
    if (!trusted.has(c.engine)) {
      console.log(
        `[report-facts] ${slug} ${monthKey}: EXCLUDING ${c.engine} from question movement -- ` +
        (c.underCollected
          ? `answered ${c.questionsCovered}/${c.questionsAsked} questions but only ${c.observations}/${c.observationsExpected} times ` +
            `(${Math.round(c.density * 100)}% density) with recorded API refusals behind the gap. It was refused, not quiet.`
          : `covered ${c.questionsCovered}/${c.questionsAsked} questions this window (${Math.round(c.pct * 100)}%).`) +
        ` Under-collection must not render as lost visibility.`,
      );
    }
  }

  // key = question \u0000 engine -> cited-at-all per window
  const cur = new Map<string, boolean>(), pri = new Map<string, boolean>();
  let curCount = 0, priCount = 0;
  for (const r of runs.results) {
    if (!trust(r.engine)) continue; // under-collected: no claim either way
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
async function buildCitationGrid(env: Env, slug: string, monthKey: string, measurementStart: number | null, precomputedCov?: EngineCoverage[]): Promise<ReportFacts["grid"]> {
  const b = monthBounds(monthKey);
  if (!b) return undefined;
  // Clamp: pre-engagement rows must never reach a customer-facing grid.
  const gridStart = Math.max(b.start, measurementStart ?? 0);
  if (gridStart >= b.end) return undefined; // month entirely predates the engagement
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.cited_entities, ck.keyword
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
  ).bind(slug, gridStart, b.end).all<{ engine: string; client_cited: number; cited_entities: string; keyword: string }>();
  if (!runs.results.length) return undefined;

  // Same guard as question movement. A grid cell reading 0% for an engine
  // that only ran 2 of 22 questions is not a measurement, it is an absence
  // dressed as one.
  // Coverage is computed ONCE per report and shared. Assessing it here and
  // again for the headline bars is how the two end up disagreeing inside one
  // document, which is worse than either verdict alone.
  const cov = precomputedCov ?? assessEngineCoverage(runs.results, await fetchEngineFailureCounts(env, gridStart, b.end));
  // Same fallback as question movement: an unassessable coverage result must
  // not blank the grid.
  const gridCoverageUsable = cov.length > 0;
  if (!gridCoverageUsable) {
    console.log(`[report-facts] ${slug} ${monthKey}: engine coverage unassessable; citation grid NOT filtered.`);
  }
  const gridTrusted = new Set(cov.filter((c) => c.sufficient).map((c) => c.engine));
  const gridTrust = (engine: string) => !gridCoverageUsable || gridTrusted.has(engine);
  for (const c of gridCoverageUsable ? cov : []) {
    if (!gridTrusted.has(c.engine)) {
      console.log(
        `[report-facts] ${slug} ${monthKey}: EXCLUDING ${c.engine} from citation grid -- ` +
        (c.underCollected
          ? `answered ${c.questionsCovered}/${c.questionsAsked} questions but only ${c.observations}/${c.observationsExpected} times ` +
            `(${Math.round(c.density * 100)}% density) with recorded API refusals behind the gap. It was refused, not quiet.`
          : `covered ${c.questionsCovered}/${c.questionsAsked} questions (${Math.round(c.pct * 100)}%).`),
      );
    }
  }

  // Layer 2 rows need the business name. A null name is not a licence to
  // report zeros: with no name we cannot tell whether a model-knowledge tool
  // named the customer, and buildReadoutSnapshot refuses to write in exactly
  // that case rather than assert an absence it never measured.
  const injCfg = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?",
  ).bind(slug).first<InjectionConfig>();
  const businessName = await resolveBusinessName(env, slug, injCfg);
  if (!businessName) {
    console.log(`[report-facts] ${slug} ${monthKey}: no business name; model-knowledge grid rows would read a false zero. Grid omitted.`);
    return undefined;
  }

  // tally[engineKey][keyword] = { cited, total }
  const tally = new Map<string, Map<string, { cited: number; total: number }>>();
  const questionSet = new Set<string>();
  for (const r of runs.results) {
    if (typeof r.engine !== "string" || typeof r.keyword !== "string") continue;
    if (!gridTrust(r.engine)) continue; // under-collected
    questionSet.add(r.keyword);
    let byQ = tally.get(r.engine);
    if (!byQ) { byQ = new Map(); tally.set(r.engine, byQ); }
    const cell = byQ.get(r.keyword) ?? { cited: 0, total: 0 };
    cell.total++;
    // Layer 2 tools cite nothing, so client_cited cannot describe them. Read
    // the entities the model actually named instead. Layer 1 keeps the flag:
    // it is URL-derived there and is the trusted source.
    const present = engineLayer(r.engine) === "model_knowledge"
      ? (businessName ? namedIn(r.cited_entities, businessName) : false)
      : r.client_cited === 1;
    if (present) cell.cited++;
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
  const counts = engineRows.map((e) => {
    const byQ = tally.get(e.key)!;
    return questions.map((q) => byQ.get(q)?.total ?? 0);
  });

  return {
    engines: engineRows.map((e) => e.label),
    layers: engineRows.map((e) => engineLayer(e.key)),
    questions,
    cells,
    counts,
  };
}

/** Derive the report's chart facts from the customer's latest snapshot + the
 *  prior delivered report's facts (for per-engine deltas). null if no snapshot. */
export async function buildReportFacts(env: Env, slug: string, monthKey: string): Promise<ReportFacts | null> {
  const mb = monthBounds(monthKey);

  // SCOPE THE QUERY BY MONTH. This used to take the newest row that existed
  // and then refuse it when week_start passed the month's end, which threw
  // away the correct row along with the wrong one.
  //
  // Every writer keys rows by the Monday of the week it RAN, while
  // buildReadoutSnapshot aggregates MONTH TO DATE. A month therefore holds one
  // row per Monday, the last of which is the complete month. On the first
  // Monday of the NEXT month a new row appears covering a few days, becomes
  // "newest", and this function refused it -- so the previous month's readout
  // stopped rendering numbers that were still sitting in the table two rows
  // down. Traced 2026-09-08: a September readout renders through October 4
  // and goes narrative-only on October 5. The deliverable is a live URL, so
  // that is not a generation-time problem that passes.
  //
  // No change for a current-month read: every row of the current month
  // already satisfies week_start < end.
  const snap = mb
    ? await env.DB.prepare(
        `SELECT engines_breakdown, top_competitors, week_start, measured_at FROM citation_snapshots
           WHERE client_slug = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1`,
      ).bind(slug, mb.end).first<{ engines_breakdown: string; top_competitors: string; week_start: number; measured_at: number | null }>()
    : await env.DB.prepare(
        `SELECT engines_breakdown, top_competitors, week_start, measured_at FROM citation_snapshots
           WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
      ).bind(slug).first<{ engines_breakdown: string; top_competitors: string; week_start: number; measured_at: number | null }>();
  if (!snap) return null;

  const verdict = snapshotUsableForMonth(snap, mb, isReadoutShapeSnapshot);
  if (!verdict.ok) {
    console.log(`[report-facts] ${slug}/${monthKey}: ${verdict.detail}; skipping facts (report stays narrative-only)`);
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
    const row: ReportFacts["engines"][number] = { name, pct: n(v?.share_pct) };
    // Only "model_knowledge" is carried; anything else (including absent, as
    // on every bridge-written snapshot) stays a citation-grade reading so
    // existing clients render exactly as before.
    if ((v as { layer?: string } | undefined)?.layer === "model_knowledge") row.layer = "model_knowledge";
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

  // Fetched once and shared: both builders must apply the SAME boundary, or
  // the grid renders a month the movement section refuses to compare.
  const measurementStart = await getMeasurementStart(env, slug);

  // Coverage for the report month, computed ONCE and shared with the grid.
  //
  // WHY THE BARS NEED THIS. `engines` above comes straight out of
  // citation_snapshots.engines_breakdown and, until 2026-09-12, was filtered by
  // nothing at all, while the grid and the movement section WERE filtered. A
  // surface could therefore appear in the headline bars at a number computed
  // from a fraction of the observations its peers collected, and be absent
  // from the grid two sections down. One document, two verdicts.
  let monthCov: EngineCoverage[] | undefined;
  try {
    const mb2 = monthBounds(monthKey);
    if (mb2) {
      const covStart = Math.max(mb2.start, measurementStart ?? 0);
      if (covStart < mb2.end) {
        const covRows = await env.DB.prepare(
          `SELECT cr.engine, ck.keyword FROM citation_runs cr
             JOIN citation_keywords ck ON ck.id = cr.keyword_id
            WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`,
        ).bind(slug, covStart, mb2.end).all<{ engine: string; keyword: string }>();
        monthCov = assessEngineCoverage(covRows.results, await fetchEngineFailureCounts(env, covStart, mb2.end));
      }
    }
  } catch (e) {
    // Unassessable coverage must never blank a report. Degrade to the
    // pre-2026-09-12 behaviour, which showed every bar, and say so.
    console.log(`[report-facts] ${slug} ${monthKey}: month coverage unassessable, bars NOT filtered: ${e instanceof Error ? e.message : e}`);
    monthCov = undefined;
  }

  // Question-level appeared/disappeared (defensive: absent on any failure).
  let questions: ReportFacts["questions"];
  try { questions = await buildQuestionMovement(env, slug, monthKey, measurementStart); } catch { questions = undefined; }

  // Per-engine x per-question citation grid (defensive: absent on any failure).
  let grid: ReportFacts["grid"];
  try { grid = await buildCitationGrid(env, slug, monthKey, measurementStart, monthCov); } catch { grid = undefined; }

  // Filter the headline bars by the SAME coverage verdict the grid uses, and
  // say what was held out.
  //
  // The join is resolveEngineKey(), not string equality. Bars are keyed by
  // whichever convention wrote the snapshot ("openai" from the dashboard,
  // "ChatGPT search" from the forensic bridge) while coverage is keyed by the
  // raw run key. Comparing those directly matches nothing, silently, and
  // silently matching nothing is exactly how a delivered report already went
  // out one engine short.
  const excludedEngines: Array<{ name: string; reason: string }> = [];
  let shownEngines = engines;
  if (monthCov && monthCov.length) {
    const verdict = new Map(monthCov.map((c) => [c.engine, c]));
    const keep: typeof engines = [];
    for (const row of engines) {
      const key = resolveEngineKey(row.name);
      const c = key ? verdict.get(key) : undefined;
      // Unresolved or unassessed means NO OPINION, so the bar stays. A guard
      // that removes what it cannot classify deletes real data.
      if (!c || c.sufficient) { keep.push(row); continue; }
      excludedEngines.push({
        name: row.name,
        reason: c.underCollected
          ? `Held out of this month's report. This surface answered ${c.questionsCovered} of ${c.questionsAsked} questions, but only ${c.observations} times against ${c.observationsExpected} for the surfaces that collected normally, and its missing runs are accounted for by recorded API refusals. We hold too little of this month to report a share we would stand behind.`
          : `Held out of this month's report. This surface answered ${c.questionsCovered} of ${c.questionsAsked} questions, below the coverage we require before publishing a share.`,
      });
      console.log(`[report-facts] ${slug} ${monthKey}: EXCLUDING ${row.name} from headline engines -- ${Math.round(c.density * 100)}% density, underCollected=${c.underCollected}.`);
    }
    shownEngines = keep;
  }

  return {
    period_label: monthLabel(monthKey),
    prior_label: priorLabel,
    engines: shownEngines,
    ...(excludedEngines.length ? { excludedEngines } : {}),
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

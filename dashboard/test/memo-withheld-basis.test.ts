/* 2026-11-03: three defects in the October memo drafts, all one shape. A
 * figure or a reason was taken from somewhere other than the comparison the
 * memo's own text states.
 *
 *   1. ChatGPT search was withheld by the comparison for an engine outage, but
 *      the memo and its chart gave Google AI Overviews' reason ("Google's own
 *      viewer links are now left out"). The link-basis guard called every
 *      google.com link a viewer link, Maps pages included, and the writer
 *      was told one fixed reason for every withheld row.
 *   2. The chart's "from" dots came from the last DELIVERED memo, two months
 *      back for one client, so a model-knowledge surface "rose" 14% to 65%
 *      across a change of question set.
 *   3. "Questions won and lost" counted flips on the Bing control, on
 *      questions outside the stable core, and on a surface the comparison
 *      withheld.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openD1, SCHEMA, type SqliteD1 } from "./support/d1-sqlite";
import { buildReportFacts, PREV_NOT_LIKE_FOR_LIKE, PREV_NO_STABLE_CORE, PREV_PARTIAL_BASELINE, PREV_SURFACE_NOT_MEASURED } from "../src/lib/report-facts";
import { gatherMemoInputs } from "../src/lib/memo-inputs";
import { LINK_BASIS, LINK_MOVEMENT_WITHHELD, priorGoogleLinkEvidence } from "../src/lib/link-basis";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const AUG1 = at("2026-08-01T00:00:00Z");
const SEP1 = at("2026-09-01T00:00:00Z");
const OCT1 = at("2026-10-01T00:00:00Z");
const NOV1 = at("2026-11-01T00:00:00Z");
const SEP_DAY = SEP1 + 86400;
const OCT_DAY = OCT1 + 86400;
const SLUG = "example-hotel";
const AIO = "Google AI Overviews";
const GPT = "ChatGPT search";
const MAPS = "https://www.google.com/maps/place/Example+Hotel";
const VIEWER = "https://www.google.com/searchviewer/1?svid=x";
const ENGINES = ["openai", "google_ai_overview", "perplexity", "anthropic", "bing"];

function addRun(d1: SqliteD1, kid: number, engine: string, runAt: number, urls: string[], cited = 0) {
  d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (?, ?, ?, ?, '[]', 'An answer about hotels.', ?)")
    .run(kid, engine, cited, JSON.stringify(urls), runAt);
}

/** Who was cited where. Key: engine|keyword|month. */
const CITED = new Set([
  "bing|1|oct",        // the control "wins" q1
  "openai|2|oct",      // ChatGPT "wins" q2, across its outage
  "perplexity|3|sep",  // Perplexity genuinely loses q3
]);

/**
 * Three questions on one day of September and one of October, every engine on
 * every question, so the stable core is the whole question set. September's
 * ChatGPT lists a Maps page and AI Overviews a viewer link. An openai outage
 * is recorded inside September. `extraQuestion` adds a fourth question that
 * misses a measured day, which takes the months off like for like.
 */
async function build(opts: { priorMemo?: string | null; extraQuestion?: boolean } = {}) {
  const d1 = await openD1(SCHEMA);
  if (!d1) return null;
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", SLUG, AUG1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Example Hotel', 'active')", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'example-hotel.test', 0, NULL, 1)", SLUG);
  for (let i = 1; i <= 4; i++) ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)", i, SLUG, `q${i}`);
  for (const e of ENGINES) for (const k of [1, 2, 3]) {
    const sept = e === "openai" ? [MAPS] : e === "google_ai_overview" && k === 1 ? [VIEWER] : [];
    addRun(d1, k, e, SEP_DAY, sept, CITED.has(`${e}|${k}|sep`) ? 1 : 0);
    addRun(d1, k, e, OCT_DAY, [], CITED.has(`${e}|${k}|oct`) ? 1 : 0);
  }
  if (opts.extraQuestion) {
    // q4 runs on both months' first day, then a second October day measures
    // q1..q3 without it, so q4 is outside the core. Perplexity "wins" it.
    for (const e of ENGINES) {
      addRun(d1, 4, e, SEP_DAY, [], 0);
      addRun(d1, 4, e, OCT_DAY, [], e === "perplexity" ? 1 : 0);
      for (const k of [1, 2, 3]) addRun(d1, k, e, OCT_DAY + 86400, [], CITED.has(`${e}|${k}|oct`) ? 1 : 0);
    }
  }
  ins("INSERT INTO instrument_events (occurred_at, kind, scope, engine, client_slug, detail) VALUES (?, 'engine_outage', 'engine', 'openai', NULL, 'billing gap')", at("2026-09-12T00:00:00Z"));

  const eb = (pct: number) => JSON.stringify({
    [GPT]: { citations: 1, total: 50, share_pct: pct, cohort_citations: 3, layer: "citation" },
    [AIO]: { citations: 1, total: 40, share_pct: pct, cohort_citations: 3, layer: "citation" },
    Perplexity: { citations: 2, total: 20, share_pct: pct, cohort_citations: 3, layer: "citation" },
    Claude: { citations: 3, total: 10, share_pct: pct, cohort_citations: 4, layer: "model_knowledge" },
    "Bing search (control)": { citations: 0, total: 5, share_pct: 0, cohort_citations: 1, layer: "citation" },
  });
  const tc = (extra: Record<string, unknown>) => JSON.stringify({ htc_venue_share_pct: 20, competitors: [], source_types: {}, offsite_hosts: [], ...extra });
  const snap = (ws: number, pct: number, extra: Record<string, unknown>) => ins(`INSERT INTO citation_snapshots
      (client_slug, week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, created_at, measured_at)
      VALUES (?, ?, 3, 1, 0.1, ?, '{}', ?, ?, ?)`, SLUG, ws, tc(extra), eb(pct), ws + 3600, ws + 3600);
  snap(at("2026-09-28T00:00:00Z"), 4, {}); // September, every link counted
  snap(NOV1 - 1, 9, { link_basis: LINK_BASIS, snapshot_kind: "month_end", window: { start: OCT1, end: NOV1 },
    source_exclusions: { google_wrapper_links: 3, wrapper_links_by_engine: { [AIO]: 3 } } });

  const priorFacts = JSON.stringify({ engines: [
    { name: GPT, pct: 4 }, { name: AIO, pct: 4 }, { name: "Perplexity", pct: 4 },
    { name: "Claude", pct: 14, layer: "model_knowledge" }, { name: "Bing search (control)", pct: 0 },
  ] });
  const memoMonth = opts.priorMemo === undefined ? "2026-09" : opts.priorMemo;
  if (memoMonth) {
    ins("INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, delivered_at, facts_json) VALUES (?, ?, 't', 'b', ?, ?)",
      SLUG, memoMonth, at(`${memoMonth}-03T00:00:00Z`), priorFacts);
  }
  return d1;
}

// ── 1. Each engine's withheld reason is its own ────────────────────────────

test("a Maps link is a page, so it is not evidence of a link-basis change", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const ev = (await priorGoogleLinkEvidence(d1.env, SLUG, SEP1, OCT1))!;
  assert.equal(ev.get(GPT), undefined, "ChatGPT listed only google.com/maps pages");
  assert.equal(ev.get(AIO), 1, "the viewer link still counts");
});

test("the memo gives ChatGPT its outage and AI Overviews its link-counting change", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const inp = await gatherMemoInputs(d1.env, SLUG, new Date((NOV1 - 1) * 1000), { monthEndSnapshot: true });
  const gpt = inp.by_engine.find((e) => e.engine === GPT)!;
  const aio = inp.by_engine.find((e) => e.engine === AIO)!;
  assert.equal(aio.movement_withheld, LINK_MOVEMENT_WITHHELD);
  assert.match(gpt.movement_withheld ?? "", /engine outage on ChatGPT search/);
  assert.doesNotMatch(gpt.movement_withheld ?? "", /viewer links|links are counted/, "never another engine's reason");
  assert.equal(gpt.prior_share_pct, null, "no snapshot delta across the outage either");
  assert.equal(gpt.delta_pp, null);
  const cmp = inp.comparison!;
  const surface = cmp.per_surface.find((x) => x.engine === GPT)!;
  assert.equal(surface.stated, false);
  assert.match(surface.statement, /\(engine outage on ChatGPT search\)/, "the statement names its own change, not 'listed below'");
  assert.deepEqual(cmp.instrument_changes, ["engine outage on ChatGPT search"], "labelled, and said once");
  for (const s of [gpt.movement_withheld!, surface.statement]) assert.doesNotMatch(s, /[—;]/);
});

test("the readout chart gives each withheld tool its own reason", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  const by = (n: string) => f.engines.find((e) => e.name === n)!;
  assert.equal(by(AIO).prevWithheld, LINK_MOVEMENT_WITHHELD);
  assert.match(by(GPT).prevWithheld ?? "", /engine outage on ChatGPT search/);
  assert.doesNotMatch(by(GPT).prevWithheld ?? "", /viewer links/);
  assert.equal(by(GPT).prev, undefined);
  assert.equal(by("Perplexity").prev, 4, "stated by the comparison, same basis: drawn");
});

// ── 2. The chart compares the months the text compares ───────────────────

test("a prior memo from two months back draws no 'from' dot", async (t) => {
  const d1 = await build({ priorMemo: "2026-08" });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.equal(f.prior_label, undefined, "never labelled with a month the text does not compare");
  for (const e of f.engines) {
    assert.equal(e.prev, undefined, `${e.name} must not be drawn against August`);
    assert.equal(e.prevWithheld, undefined);
  }
});

test("last month's memo off the stable core draws no 'from' dot, and says why", async (t) => {
  const d1 = await build({ extraQuestion: true });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.equal(f.prior_label, "Sep 2026");
  for (const e of f.engines) {
    assert.equal(e.prev, undefined, `${e.name}: a share over every question is not the core's basis`);
    assert.equal(e.prevWithheld, PREV_NOT_LIKE_FOR_LIKE);
  }
  assert.ok(f.engines.some((e) => e.name === "Claude"), "model-knowledge surfaces too: 14% to 65% was one of these");
  assert.doesNotMatch(PREV_NOT_LIKE_FOR_LIKE, /[—;]/);
});

// ── 3. Questions won and lost ─────────────────────────────────────────────

test("questions won and lost leave out the control, withheld surfaces and questions outside the core", async (t) => {
  const d1 = await build({ extraQuestion: true });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  const appeared = f.questions?.appeared ?? [];
  const disappeared = f.questions?.disappeared ?? [];
  const chips = [...appeared, ...disappeared].flatMap((x) => x.engines);
  assert.ok(!chips.includes("Bing search (control)"), "the control is not an AI tool");
  assert.ok(!chips.includes("ChatGPT"), "its comparison is withheld for an outage");
  assert.ok(!appeared.some((x) => x.q === "q4"), "q4 missed a measured day, so it is outside the core");
  assert.deepEqual(disappeared, [{ q: "q3", engines: ["Perplexity"] }], "the real loss survives");
  assert.deepEqual(appeared, []);
});

test("no stable core, no questions section", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  d1.db.prepare("DELETE FROM citation_runs WHERE run_at < ?").run(OCT1);
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.equal(f.questions, undefined);
});

// ── 4. Each "not compared" reason is true of its own case (2026-11-05) ───
// One shared sentence told a reader "the memo compares the questions measured
// on every day of both months" when there was no comparison at all.

test("no stable core: the chart says so, not that the memo compares a core", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  d1.db.prepare("DELETE FROM citation_runs WHERE run_at < ?").run(OCT1);
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  for (const e of f.engines) {
    assert.equal(e.prev, undefined);
    assert.equal(e.prevWithheld, PREV_NO_STABLE_CORE, e.name);
  }
});

test("measurement began partway through last month: the chart says that", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  d1.db.prepare("UPDATE measurement_registry SET measurement_start = ? WHERE client_slug = ?").run(SEP_DAY, SLUG);
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  for (const e of f.engines) {
    assert.equal(e.prev, undefined);
    assert.equal(e.prevWithheld, PREV_PARTIAL_BASELINE, e.name);
  }
});

test("a tool with no readings on the shared questions gets its own reason", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  d1.db.prepare("DELETE FROM citation_runs WHERE engine = 'perplexity'").run();
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  const p = f.engines.find((e) => e.name === "Perplexity")!;
  assert.equal(p.prev, undefined);
  assert.equal(p.prevWithheld, PREV_SURFACE_NOT_MEASURED);
  assert.notEqual(f.engines.find((e) => e.name === AIO)!.prevWithheld, PREV_SURFACE_NOT_MEASURED, "only the tool that has no readings");
});

test("every reader-facing 'not compared' reason is plain and free of banned punctuation", () => {
  for (const r of [PREV_NOT_LIKE_FOR_LIKE, PREV_NO_STABLE_CORE, PREV_PARTIAL_BASELINE, PREV_SURFACE_NOT_MEASURED]) {
    assert.match(r, /^Not compared with last month: /);
    assert.doesNotMatch(r, /[—;]/);
  }
});

test("the memo withholds a surface the comparison withheld with no event behind it", async (t) => {
  const d1 = await build();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  // Perplexity has no September runs, so the comparison withholds it as not
  // measured in the prior window. No instrument event is involved.
  d1.db.prepare("DELETE FROM citation_runs WHERE engine = 'perplexity' AND run_at < ?").run(OCT1);
  const inp = await gatherMemoInputs(d1.env, SLUG, new Date((NOV1 - 1) * 1000), { monthEndSnapshot: true });
  const p = inp.by_engine.find((e) => e.engine === "Perplexity")!;
  assert.equal(p.delta_pp, null, "the chart withholds it, so the memo must not state a delta");
  assert.equal(p.prior_share_pct, null);
  assert.match(p.movement_withheld ?? "", /^Not compared with last month: /);
});

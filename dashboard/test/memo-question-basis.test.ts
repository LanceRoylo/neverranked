/* 2026-10-05. An independent audit of a delivered monthly memo traced several
 * false sentences to how the memo's inputs were built and labelled:
 *
 *  1. Per-question shares pooled all seven surfaces, the Bing control and the
 *     two model-knowledge tools included, and the memo called them "% of
 *     citations" (80/157 = 51% on a question where the four search tools listed
 *     the client's site in 79 of 81 checks).
 *  2. Window bounds: the main runs query had a floor and no ceiling, and the
 *     noise band ran on the wall clock with no engagement floor.
 *  3. The headline called the client "invisible" and "not named" on questions
 *     where the search tools named the client in the answer text.
 *  4. The venue total carried the Bing control's one own-site link.
 *  5. Shares of EVERY listed source were described as "off-site".
 *  6. Google AI Overviews' viewer/redirect links counted as a source host.
 *  7. A robots.txt check was recommended while the data showed the site
 *     listed hundreds of times.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildQuestionFacts, gatherMemoInputs, inQuestionBasis, OFFSITE_BASIS, QUESTION_MEASURE,
  type MemoInputs, type QuestionRun,
} from "../src/lib/memo-inputs";
import { allowedNumberSet } from "../src/lib/memo-generator";
import { namedInAnswer, buildPresenceSql, RESPONSE_TEXT_CAP, RESPONSE_TEXT_CAP_RAISED_AT } from "../src/lib/answer-presence";
import { classifyGoogleLink } from "../src/lib/classify-source";
import { buildReadoutSnapshot } from "../src/citations";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const NAME = "Harbor Lights Hotel";
const CUR = 1_700_000_000; // current window start, before the cap was raised
const NAMED = "For a quiet stay, Harbor Lights Hotel is a good pick.";
const NOT_NAMED = "Several hotels near the marina have rooftop pools.";

function run(engine: string, kid: number, at: number, cited: 0 | 1, text?: string | null): QuestionRun {
  return { engine, client_cited: cited, run_at: at, keyword: `q${kid}`, category: "client", kid, response_text: text };
}

// ── 1. The per-question basis ─────────────────────────────────────────────

test("only the four search tools are in the per-question basis", () => {
  for (const e of ["perplexity", "openai", "gemini", "google_ai_overview"]) assert.equal(inQuestionBasis(e), true, e);
  for (const e of ["bing", "anthropic", "gemma", "something_new"]) assert.equal(inQuestionBasis(e), false, e);
});

test("per-question share counts search-tool checks only, never the control or model-knowledge flags", () => {
  const rows: QuestionRun[] = [];
  // Search tools: site listed on 3 of 4 checks.
  rows.push(run("perplexity", 1, CUR + 10, 1, NAMED), run("openai", 1, CUR + 10, 1, NAMED),
    run("gemini", 1, CUR + 10, 1, NAMED), run("google_ai_overview", 1, CUR + 10, 0, NOT_NAMED));
  // Control and model-knowledge flags that used to inflate the denominator
  // and, for model-knowledge, the numerator.
  for (let i = 0; i < 4; i++) rows.push(run("bing", 1, CUR + 10, 0, NAMED));
  for (let i = 0; i < 4; i++) rows.push(run("gemma", 1, CUR + 10, 1, NAMED), run("anthropic", 1, CUR + 10, 0, NAMED));
  const f = buildQuestionFacts(rows, { curStart: CUR, businessName: NAME });
  const q = f.by_question[0];
  assert.equal(q.current_runs, 4, "only the four search-tool checks");
  assert.equal(q.site_in_sources_runs, 3);
  assert.equal(q.current_pct, 75, "not (3 + 4 gemma) / 16");
  assert.equal(q.measure, QUESTION_MEASURE);
  assert.equal(q.measure, "site_in_sources");
  assert.match(q.basis ?? "", /not the Bing control/);
  assert.match(q.basis ?? "", /not traffic/);
  // Group and run-based totals sit on the same basis.
  assert.equal(f.by_category[0].runs, 4);
  assert.equal(f.by_category[0].cited, 3);
  assert.equal(f.totals.curRuns, 4);
  assert.equal(f.totals.curCited, 3);
});

test("like-for-like is on the same basis and says so", () => {
  const rows = [
    run("perplexity", 1, CUR - 100, 0), run("perplexity", 1, CUR - 100, 1), run("bing", 1, CUR - 100, 1),
    run("perplexity", 1, CUR + 100, 1), run("gemma", 1, CUR + 100, 1),
  ];
  const f = buildQuestionFacts(rows, { curStart: CUR, businessName: NAME });
  assert.equal(f.like_for_like?.prior_share_pct, 50);
  assert.equal(f.like_for_like?.current_share_pct, 100);
  assert.match(f.like_for_like?.basis ?? "", /four search tools only/);
});

// ── 3. Named in the answer, per question ──────────────────────────────────

test("a question with no page from the site can still be NAMED, and the two are counted apart", () => {
  const rows = [
    run("perplexity", 2, CUR + 1, 0, NAMED),
    run("openai", 2, CUR + 1, 0, NAMED),
    run("gemini", 2, CUR + 1, 0, NOT_NAMED),
    // Truncated at the cap and not found: indeterminate, not "not named".
    run("google_ai_overview", 2, RESPONSE_TEXT_CAP_RAISED_AT + 1, 0, "x".repeat(RESPONSE_TEXT_CAP)),
    // The control's text is never read, even when it names the client.
    run("bing", 2, CUR + 1, 0, NAMED),
    // Prior window: not part of this period's naming count.
    run("perplexity", 2, CUR - 1, 0, NAMED),
  ];
  const q = buildQuestionFacts(rows, { curStart: CUR, businessName: NAME }).by_question[0];
  assert.equal(q.site_in_sources_runs, 0);
  assert.equal(q.current_pct, 0);
  assert.equal(q.named_runs, 2, "named although no page was listed");
  assert.equal(q.named_unknown_runs, 1);
  // Decision B (2026-10-05): a floor and a ceiling over EVERY answer, the
  // truncated one counted as not naming in the floor and naming in the ceiling.
  assert.equal(q.named_total_runs, 4);
  assert.equal(q.named_floor_pct, 50);
  assert.equal(q.named_ceiling_pct, 75);
});

test("an answer the query did not return is unknown, never a zero", () => {
  const q = buildQuestionFacts([run("perplexity", 3, CUR + 1, 0, undefined)], { curStart: CUR, businessName: NAME }).by_question[0];
  assert.equal(q.named_runs, 0);
  assert.equal(q.named_unknown_runs, 1);
  assert.equal(q.named_total_runs, 1);
  // Nothing readable: the honest statement is the whole range.
  assert.equal(q.named_floor_pct, 0);
  assert.equal(q.named_ceiling_pct, 100);
});

test("with no usable business name the naming fields are ABSENT, not zero", () => {
  for (const businessName of [null, "Inn"]) {
    const f = buildQuestionFacts([run("perplexity", 4, CUR + 1, 0, NOT_NAMED)], { curStart: CUR, businessName });
    assert.equal("named_runs" in f.by_question[0], false);
    assert.equal("questions_never_named" in f.by_category[0], false);
    assert.equal(f.namedByEngine.size, 0);
  }
});

test("a group's never-named count needs every answer judged and none naming", () => {
  const rows = [
    run("perplexity", 5, CUR + 1, 0, NOT_NAMED), // never named, fully judged
    run("perplexity", 6, CUR + 1, 0, NAMED),     // named
    run("perplexity", 7, RESPONSE_TEXT_CAP_RAISED_AT + 1, 0, "y".repeat(RESPONSE_TEXT_CAP)), // unknown only
  ];
  const c = buildQuestionFacts(rows, { curStart: CUR, businessName: NAME }).by_category[0];
  assert.equal(c.questions_never_cited, 3, "no page from the site on any of the three");
  assert.equal(c.questions_never_named, 1, "only the fully judged one; an unknown is not a no");
});

test("per-engine naming is carried for the search tools", () => {
  const f = buildQuestionFacts([run("openai", 8, CUR + 1, 0, NAMED), run("openai", 9, CUR + 1, 0, NOT_NAMED)], { curStart: CUR, businessName: NAME });
  assert.deepEqual(f.namedByEngine.get("openai"), { named_runs: 1, named_unknown_runs: 0, named_total_runs: 2, named_floor_pct: 50, named_ceiling_pct: 50 });
});

// ── 3a. Diacritics and cut-off names (answer-presence) ────────────────────

test("a macron or accented spelling of the name is a mention", () => {
  assert.equal(namedInAnswer({ text: "Dinner at Kō Olina Grill was the highlight.", businessName: "Ko Olina Grill" }), true);
  assert.equal(namedInAnswer({ text: "Try CAFÉ MÁNOA for breakfast.", businessName: "Cafe Manoa" }), true);
  // Decomposed form: base letter plus a combining macron.
  assert.equal(namedInAnswer({ text: "Kō Olina Grill is nearby.", businessName: "Ko Olina Grill" }), true);
});

test("an answer that ends part way through the name is indeterminate, not 'not named'", () => {
  assert.equal(namedInAnswer({ text: "Good options include the marina inns and Harbor Lights Ho", businessName: NAME }), null);
  assert.equal(namedInAnswer({ text: "Good options include Harbor Lig", businessName: NAME }), null);
  // Not on a word boundary, or too short to be evidence: an ordinary answer.
  assert.equal(namedInAnswer({ text: "We stayed at the Seaharbor", businessName: NAME }), false);
  assert.equal(namedInAnswer({ text: "Look for ha", businessName: NAME }), false);
});

test("the SQL mirror matches accented spellings and cut-off names the same way", async (t) => {
  let sqlite: typeof import("node:sqlite");
  try { sqlite = await import("node:sqlite"); } catch { t.skip("node:sqlite unavailable"); return; }
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`CREATE TABLE citation_keywords (id INTEGER PRIMARY KEY, client_slug TEXT);
           CREATE TABLE citation_runs (keyword_id INTEGER, engine TEXT, run_at INTEGER, response_text TEXT);
           INSERT INTO citation_keywords VALUES (1, 'demo');`);
  const texts: Array<string | null> = [
    "Dinner at Kō Olina Grill was the highlight.", // named, macron
    "ko olina grill", // named, plain
    "Several places near the lagoon.", // complete, not named
    "Options include Ko Olina Gr", // cut off mid-name
    "x".repeat(RESPONSE_TEXT_CAP), // truncated at the cap
    null, // no answer stored
  ];
  const ins = db.prepare("INSERT INTO citation_runs VALUES (1, 'perplexity', ?, ?)");
  for (const tx of texts) ins.run(RESPONSE_TEXT_CAP_RAISED_AT + 5, tx);
  const q = buildPresenceSql({ clientSlug: "demo", businessName: "Ko Olina Grill", windowStart: 0, windowEnd: 9_999_999_999 })!;
  const row = db.prepare(q.sql).get(...(q.binds as Array<string | number>)) as { total: number; named: number; unknown_count: number };
  const ts = texts.map((tx) => namedInAnswer({ text: tx, businessName: "Ko Olina Grill" }));
  assert.equal(row.total, 6);
  assert.equal(row.named, ts.filter((v) => v === true).length);
  assert.equal(row.unknown_count, ts.filter((v) => v === null).length);
  assert.deepEqual([row.named, row.unknown_count], [2, 3]);
  assert.deepEqual(q.binds.slice(-3), ["demo", 0, 9_999_999_999]);
});

// ── 6. Google wrapper links ───────────────────────────────────────────────

test("Google viewer, redirect and search-page links are wrappers, Google's own pages are not", () => {
  assert.deepEqual(classifyGoogleLink("https://www.google.com/searchviewer/10?svid=CAwSHRIb"), { kind: "wrapper" });
  assert.deepEqual(classifyGoogleLink("https://google.com/goto?url=CAESYwHrOzAV"), { kind: "wrapper" });
  assert.deepEqual(classifyGoogleLink("https://www.google.com/search?q=time+in+a+city"), { kind: "wrapper" });
  assert.deepEqual(classifyGoogleLink("https://www.google.com/url?q=https://www.yelp.com/biz/demo&sa=U"),
    { kind: "target", url: "https://www.yelp.com/biz/demo" });
  for (const u of ["https://support.google.com/business/answer/7091", "https://developers.google.com/search/docs",
    "https://www.google.com/maps/place/x", "https://www.tripadvisor.com/x", "not a url"]) {
    assert.deepEqual(classifyGoogleLink(u), { kind: "page" }, u);
  }
});

function snapshotEnv(rows: unknown[], registryStart: number | null) {
  const written: Record<string, unknown> = {};
  const runsBinds: unknown[][] = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("is_competitor = 0")) return { domain: "harborlights.example" };
              if (sql.includes("FROM customers")) return { name: NAME };
              if (sql.includes("measurement_registry")) return registryStart === null ? null : { measurement_start: registryStart };
              return null;
            },
            async all() {
              if (sql.includes("is_competitor = 1")) return { results: [{ domain: "rival.example", competitor_label: null }] };
              if (sql.includes("citation_runs")) { runsBinds.push(args); return { results: rows }; }
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO citation_snapshots")) written.top_competitors = args[5];
              return {};
            },
          };
        },
      };
    },
  };
  return { env: { DB } as never, written, runsBinds };
}

test("the readout snapshot leaves Google wrapper links out of sources and hosts", async () => {
  const urls = [
    "https://www.tripadvisor.com/Hotel_Review-demo",
    "https://www.google.com/searchviewer/10?svid=A", "https://www.google.com/searchviewer/10?svid=B",
    "https://google.com/goto?url=CAES",
    "https://www.google.com/url?q=https://www.yelp.com/biz/demo",
    "https://harborlights.example/rooms",
  ];
  const { env, written } = snapshotEnv([
    { engine: "google_ai_overview", client_cited: 1, cited_urls: JSON.stringify(urls), cited_entities: "[]", keyword: "q1" },
  ], null);
  const res = await buildReadoutSnapshot(env, "demo", 0, 9_999_999_999);
  assert.equal(res.ok, true);
  const tc = JSON.parse(String(written.top_competitors));
  const hosts = (tc.offsite_hosts as Array<{ host: string }>).map((h) => h.host);
  assert.ok(!hosts.some((h) => h.includes("google.")), `google wrapper counted as a source: ${hosts}`);
  assert.ok(hosts.includes("yelp.com"), "a wrapper carrying a real target is credited to the target");
  const st = tc.source_types as Record<string, { citations: number }>;
  assert.equal(Object.values(st).reduce((a, b) => a + b.citations, 0), 3, "tripadvisor + yelp + own site");
  assert.deepEqual(tc.source_exclusions, { google_wrapper_links: 3, google_wrapper_links_resolved: 1 });
});

// ── 2. measurement_start and the end of the period ────────────────────────

test("the readout snapshot never reads runs from before measurement_start", async () => {
  const { env, runsBinds } = snapshotEnv([
    { engine: "perplexity", client_cited: 0, cited_urls: "[]", cited_entities: "[]", keyword: "q1" },
  ], 1_000);
  await buildReadoutSnapshot(env, "demo", 0, 9_999_999_999);
  assert.deepEqual(runsBinds[0], ["demo", 1_000, 9_999_999_999]);
});

const DAY = 86400;
const OCT1 = Date.UTC(2026, 9, 1) / 1000;
const SEP1 = Date.UTC(2026, 8, 1) / 1000;
const NOV1 = Date.UTC(2026, 10, 1) / 1000;
const CLOCK = new Date((NOV1 - 1) * 1000); // the 2nd-of-month draft's clock

type Fixture = { engine: string; client_cited: number; run_at: number; kid: number; text?: string };

function memoEnv(opts: { runs: Fixture[]; mStart: number | null; snapshot?: { eb: unknown; tc: unknown } }) {
  const calls: Record<string, unknown[][]> = {};
  const log = (k: string, a: unknown[]) => ((calls[k] ??= []).push(a));
  let snapCalls = 0;
  const DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("measurement_registry")) return opts.mStart === null ? null : { measurement_start: opts.mStart };
              if (sql.includes("FROM customers")) return { client_slug: "demo", name: NAME, category_label: null, plan_markdown: null, primary_contact_name: null };
              if (sql.includes("COUNT(DISTINCT date")) { log("cadence", args); return { days: 1, runs: 1 }; }
              if (sql.includes("citation_snapshots")) {
                snapCalls++;
                if (snapCalls === 1 && opts.snapshot) {
                  return { engines_breakdown: JSON.stringify(opts.snapshot.eb), top_competitors: JSON.stringify(opts.snapshot.tc), measured_at: OCT1 + DAY, week_start: OCT1 };
                }
                return null;
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM domains")) {
                return { results: [{ domain: "harborlights.example", competitor_label: null, is_competitor: 0 }, { domain: "rival.example", competitor_label: "Rival", is_competitor: 1 }] };
              }
              if (sql.includes("GROUP BY day")) { log("noise", args); return { results: [] }; }
              if (sql.includes("AS response_text")) {
                log("runs", args);
                // Emulate the query: [curStart, slug, from, to].
                const [curStart, , from, to] = args as [number, string, number, number];
                return {
                  results: opts.runs
                    .filter((r) => r.run_at >= from && r.run_at < to)
                    .map((r) => ({
                      engine: r.engine, client_cited: r.client_cited, cited_entities: "[]", run_at: r.run_at,
                      keyword: `q${r.kid}`, category: "client", kid: r.kid,
                      response_text: r.run_at >= curStart && inQuestionBasis(r.engine) ? (r.text ?? null) : null,
                    })),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
  return { env: { DB } as never, calls };
}

test("runs after the period's clock and before measurement_start never enter a figure", async () => {
  const runs: Fixture[] = [
    { engine: "perplexity", client_cited: 1, run_at: SEP1 - DAY, kid: 1 },     // pre-engagement
    { engine: "perplexity", client_cited: 1, run_at: SEP1 + 9 * DAY, kid: 1 }, // prior month
    { engine: "perplexity", client_cited: 0, run_at: OCT1 + 9 * DAY, kid: 1 }, // this month
    { engine: "perplexity", client_cited: 1, run_at: NOV1 + DAY / 2, kid: 1 }, // drafted on the 2nd: after the period
  ];
  const { env, calls } = memoEnv({ runs, mStart: SEP1 });
  const inp = await gatherMemoInputs(env, "demo", CLOCK);
  const q = inp.by_question[0];
  assert.equal(q.current_runs, 1, "November's run must not be October's");
  assert.equal(q.current_pct, 0);
  assert.equal(q.prior_pct, 100, "August's pre-engagement run must not be September's");
  assert.equal(inp.overall.current.runs, 1);
  assert.deepEqual(calls.runs[0].slice(2), [SEP1, NOV1]);
  // The noise band ends at the clock, not the wall clock, and has the floor.
  const [, nStart, nEnd] = calls.noise[0] as [string, number, number];
  assert.equal(nEnd, NOV1);
  assert.ok(nStart >= SEP1);
  assert.deepEqual(calls.cadence[0].slice(1), [OCT1, NOV1]);
});

test("an engagement starting mid-month floors the current window", async () => {
  const start = OCT1 + 14 * DAY;
  const runs: Fixture[] = [
    { engine: "openai", client_cited: 1, run_at: OCT1 + 2 * DAY, kid: 1 }, // dry run before the start
    { engine: "openai", client_cited: 0, run_at: start + DAY, kid: 1 },
  ];
  const { env, calls } = memoEnv({ runs, mStart: start });
  const inp = await gatherMemoInputs(env, "demo", CLOCK);
  assert.equal(inp.by_question[0].current_runs, 1);
  assert.equal(inp.by_question[0].current_pct, 0);
  assert.equal(inp.by_question[0].first_reading, true);
  assert.equal((calls.noise[0] as number[])[1], start);
});

// ── 4, 5, 7. Control out of totals, off-site basis, robots.txt ────────────

const SNAP = {
  eb: {
    "Perplexity": { citations: 10, total: 100, share_pct: 10, cohort_citations: 50, layer: "citation" },
    "Bing search (control)": { citations: 1, total: 50, share_pct: 2, cohort_citations: 5, layer: "citation" },
    "Claude": { citations: 5, total: 20, share_pct: 25, cohort_citations: 9, layer: "model_knowledge" },
  },
  tc: {
    htc_venue_share_pct: 20,
    competitors: [{ domain: "rival.example", label: "Rival", citations: 40 }],
    source_types: { independent_web: { citations: 60, share_pct: 60 }, owned: { citations: 10, share_pct: 10 } },
    offsite_hosts: [{ host: "tripadvisor.com", citations: 20, share_pct: 20 }],
  },
};

test("the Bing control is never in the venue total, and own-site pulls exclude it", async () => {
  const runs: Fixture[] = [{ engine: "perplexity", client_cited: 1, run_at: OCT1 + DAY, kid: 1, text: NAMED }];
  const { env } = memoEnv({ runs, mStart: SEP1, snapshot: SNAP });
  const inp = await gatherMemoInputs(env, "demo", CLOCK);
  assert.equal(inp.cohort.customer_mentions, 10, "11 would include the control's own-site link");
  assert.equal(inp.overall.current.cited, 10);
  assert.equal(inp.overall.current.runs, 50, "venue total: 10 own + 40 competitor");
  assert.equal(inp.own_site_pulls, 10);
  assert.match(inp.own_site_pulls_basis ?? "", /Bing control excluded/);
  // Offsite shares say what they are a share of.
  assert.equal(inp.offsite.basis, OFFSITE_BASIS);
  assert.match(OFFSITE_BASIS, /including the client's own site and competitor sites/);
  // The site is demonstrably reachable, so no robots.txt destination is offered.
  assert.ok(!inp.destinations.tools.some((t) => /robots/i.test(t.name)), "robots.txt offered despite own-site pulls");
  assert.ok(!inp.destinations.tools.some((t) => /AI reads/i.test(t.checks)), "a tool asserts what AI reads");
  // Per-engine naming reaches the snapshot row for the search tool.
  const p = inp.by_engine.find((e) => e.engine === "Perplexity");
  assert.equal(p?.named_runs, 1);
});

test("robots.txt stays available when nothing shows the site is reachable", async () => {
  const runs: Fixture[] = [{ engine: "perplexity", client_cited: 0, run_at: OCT1 + DAY, kid: 1 }];
  const { env } = memoEnv({ runs, mStart: SEP1 });
  const inp = await gatherMemoInputs(env, "demo", CLOCK);
  assert.equal(inp.own_site_pulls, 0);
  assert.ok(inp.destinations.tools.some((t) => /robots/i.test(t.name)));
});

test("run-based engine rows say a search tool's flag is site-in-sources, not naming", async () => {
  const runs: Fixture[] = [
    { engine: "gemini", client_cited: 1, run_at: OCT1 + DAY, kid: 1, text: NOT_NAMED },
    { engine: "gemma", client_cited: 1, run_at: OCT1 + DAY, kid: 1 },
  ];
  const { env } = memoEnv({ runs, mStart: SEP1 });
  const inp = await gatherMemoInputs(env, "demo", CLOCK);
  assert.equal(inp.by_engine.find((e) => e.engine === "gemini")?.measure, "answers_with_site_in_sources");
  assert.equal(inp.by_engine.find((e) => e.engine === "gemma")?.measure, "answers_naming_customer");
});

// ── The writer's rules and the number guard ───────────────────────────────

test("the prompt binds the writer to each new field", () => {
  const prompt = read("../src/lib/memo-generator.ts");
  assert.match(prompt, /PER-QUESTION FIGURES ARE "site_in_sources" ON THE FOUR SEARCH TOOLS ONLY/);
  assert.match(prompt, /NEVER call it a share of citations, "% of citations"/);
  assert.match(prompt, /never write that a tool sent people, drove visits/);
  assert.match(prompt, /unless named_runs is 0 for that question/);
  assert.match(prompt, /"NOT NAMED" AND "NO PAGE FROM YOUR SITE" ARE DIFFERENT FINDINGS/);
  assert.match(prompt, /NEVER call them off-site citations, off-site sources/);
  assert.match(prompt, /when data\.own_site_pulls is above zero/);
  assert.match(prompt, /NEVER ASSERT WHAT ANY PLATFORM READS/);
  // The first-memo heading itself asserted invisibility.
  assert.doesNotMatch(prompt, /Where you are invisible/);
  assert.doesNotMatch(prompt, /Whether a citation-layer engine puts the customer in its answers is answers_citing_customer_pct/);
  assert.match(prompt, /INPUT_CONTRACT_REVISION = "2026-10-05\./);
});

test("the figures the writer is now told to quote verify against the number guard", () => {
  const inp = {
    overall: { current: { runs: 0, cited: 0, share_pct: 0 }, prior: { runs: 0, cited: 0, share_pct: 0 }, share_delta_pp: 0 },
    cohort: { rank: null, members: [], customer_mentions: 0 },
    by_engine: [{ engine: "Perplexity", current_share_pct: 1, prior_share_pct: 1, delta_pp: 0, current_runs: 2,
      named_runs: 344, named_unknown_runs: 0, named_total_runs: 919, named_floor_pct: 37.4, named_ceiling_pct: 37.4 }],
    by_question: [{ keyword: "k", category: "c", current_pct: 97.5, prior_pct: null, delta_pp: null, current_runs: 81,
      site_in_sources_runs: 79, named_runs: 57, named_unknown_runs: 4, named_total_runs: 81, named_floor_pct: 70.4, named_ceiling_pct: 75.3 }],
    by_category: [{ category: "c", questions: 9, runs: 700, cited: 0, share_pct: 0, questions_never_cited: 9,
      runs_on_never_cited: 700, questions_never_named: 4 }],
    offsite: { source_types: [], hosts: [] },
    own_site_pulls: 431,
  } as unknown as MemoInputs;
  const allowed = allowedNumberSet(inp);
  for (const n of ["344", "919", "37.4", "81", "79", "57", "4", "70.4", "75.3", "431"]) assert.ok(allowed.has(n), `${n} must verify`);
});

/* 2026-10-05, decision D: Google AI Overviews' own-site share stops counting
 * Google's own viewer links, and says so once.
 *
 * a4cdba7 left Google's result-page wrappers (/searchviewer, /goto, /search,
 * /url, /aclk, /imgres on bare google.com) out of the source mix and the host
 * list, but each engine's link TOTAL, the denominator of its own-site link
 * share, still counted them, and on real client data they were a large share
 * of AI Overviews' links. Now the totals leave them out too, the count is
 * recorded per engine, and no month-over-month link-share movement is stated
 * across the change.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openD1, SCHEMA, type SqliteD1 } from "./support/d1-sqlite";
import { buildReadoutSnapshot, computeProminence } from "../src/citations";
import { buildReportFacts } from "../src/lib/report-facts";
import { gatherMemoInputs } from "../src/lib/memo-inputs";
import { allowedNumberSet } from "../src/lib/memo-generator";
import { engineNoteClaimsOk } from "../src/lib/report-notes";
import { renderCharts } from "../src/routes/customer-readouts";
import {
  LINK_BASIS, LEGACY_LINK_BASIS, LINK_MOVEMENT_WITHHELD, linkBasisNote, linkBasisOf, linkMovementWithheld,
  priorGoogleLinkEvidence,
} from "../src/lib/link-basis";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const AUG1 = at("2026-08-01T00:00:00Z");
const SEP1 = at("2026-09-01T00:00:00Z");
const OCT1 = at("2026-10-01T00:00:00Z");
const NOV1 = at("2026-11-01T00:00:00Z");
const SLUG = "example-hotel";
const AIO = "Google AI Overviews";

async function seed(d1: SqliteD1) {
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", SLUG, AUG1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Example Hotel', 'active')", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'example-hotel.test', 0, NULL, 1)", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'rival-inn.test', 1, 'Rival Inn', 1)", SLUG);
  for (let i = 1; i <= 3; i++) ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)", i, SLUG, `q${i}`);
}
function addRun(d1: SqliteD1, kid: number, engine: string, runAt: number, urls: string[], cited = 0, text = "An answer about hotels.") {
  d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (?, ?, ?, ?, '[]', ?, ?)")
    .run(kid, engine, cited, JSON.stringify(urls), text, runAt);
}

// ── The writer ────────────────────────────────────────────────────────────

const AIO_URLS = [
  "https://www.tripadvisor.com/Hotel_Review-demo",
  "https://www.google.com/searchviewer/10?svid=A",
  "https://www.google.com/searchviewer/10?svid=B",
  "https://google.com/goto?url=CAES",
  "https://www.google.com/url?q=https://www.yelp.com/biz/demo", // carries a real target: still a link
  "https://example-hotel.test/rooms",
];

test("AI Overviews' link total leaves out Google's viewer links, and the count is recorded per engine", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1);
  addRun(d1, 1, "google_ai_overview", OCT1 + 86400, AIO_URLS, 1);
  addRun(d1, 2, "perplexity", OCT1 + 86400, ["https://example-hotel.test/a", "https://news.example/b", "https://rival-inn.test/c", "https://www.tripadvisor.com/d"], 1);
  assert.equal((await buildReadoutSnapshot(d1.env, SLUG, OCT1, NOV1, { keyAt: NOV1 - 1 })).ok, true);
  const row = d1.rows("SELECT engines_breakdown, top_competitors, citation_share FROM citation_snapshots")[0];
  const eb = JSON.parse(String(row.engines_breakdown));
  assert.equal(eb[AIO].total, 3, "6 listed, 3 wrappers left out, the resolved one kept");
  assert.equal(eb[AIO].citations, 1, "the own-site count is unchanged");
  assert.equal(eb[AIO].share_pct, 33, "1 of 3, not 1 of 6");
  assert.equal(eb.Perplexity.total, 4, "an engine with no wrappers is untouched");
  const tc = JSON.parse(String(row.top_competitors));
  assert.equal(tc.link_basis, LINK_BASIS);
  assert.deepEqual(tc.source_exclusions.wrapper_links_by_engine, { [AIO]: 3 });
  // The pooled scalar still counts every listed link: 2 own of 10.
  assert.equal(row.citation_share, 0.2);
});

test("a wrapper is never the client's domain, so run-level client_cited cannot change", () => {
  // Even a wrapper whose target IS the client's site: the listed link is google.com.
  const wrappers = [
    "https://www.google.com/searchviewer/10?svid=A",
    "https://www.google.com/url?q=https://example-hotel.test/rooms",
    "https://google.com/goto?url=CAES",
  ];
  assert.equal(computeProminence([], wrappers, "example-hotel.test", null), null);
  assert.equal(computeProminence([], [...wrappers, "https://example-hotel.test/rooms"], "example-hotel.test", null), 4, "the own page still counts where it sits");
});

// ── The rules ─────────────────────────────────────────────────────────────

test("one plain sentence names the engines whose link counts changed", () => {
  assert.equal(linkBasisNote({ [AIO]: 1200 }), "Google AI Overviews' link count leaves out Google's own viewer links.");
  assert.equal(linkBasisNote({ [AIO]: 3, Perplexity: 1 }), "The link counts for Google AI Overviews and Perplexity leave out Google's own viewer links.");
  assert.equal(linkBasisNote({}), null);
  assert.equal(linkBasisNote({ [AIO]: 0 }), null);
  assert.equal(linkBasisNote(undefined), null);
  for (const s of [linkBasisNote({ [AIO]: 1 }) ?? "", LINK_MOVEMENT_WITHHELD]) assert.doesNotMatch(s, /[—;]/, "no em dash, no semicolon");
});

test("movement is withheld wherever the change could have touched the engine, and fails closed", () => {
  const base = { curBasis: LINK_BASIS, priorBasis: LEGACY_LINK_BASIS };
  assert.equal(linkMovementWithheld({ ...base, curExcluded: 3, priorEvidence: 0 }), LINK_MOVEMENT_WITHHELD);
  assert.equal(linkMovementWithheld({ ...base, curExcluded: 0, priorEvidence: 2 }), LINK_MOVEMENT_WITHHELD, "wrappers last month only");
  assert.equal(linkMovementWithheld({ ...base, curExcluded: 0, priorEvidence: null }), LINK_MOVEMENT_WITHHELD, "unreadable evidence");
  assert.equal(linkMovementWithheld({ ...base, curExcluded: 0, priorEvidence: 0 }), null, "provably untouched");
  assert.equal(linkMovementWithheld({ curBasis: LINK_BASIS, priorBasis: LINK_BASIS, curExcluded: 9, priorEvidence: 9 }), null, "same basis");
  assert.equal(linkBasisOf(undefined), LEGACY_LINK_BASIS);
});

test("prior evidence counts runs listing a bare Google host, and nothing else", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1);
  addRun(d1, 1, "google_ai_overview", SEP1 + 86400, ["https://www.google.com/searchviewer/1?svid=x"]);
  addRun(d1, 1, "google_ai_overview", SEP1 + 2 * 86400, ["HTTPS://WWW.GOOGLE.COM/url?q=demo"]);
  addRun(d1, 2, "gemini", SEP1 + 86400, ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/x"]);
  addRun(d1, 2, "perplexity", SEP1 + 86400, ["https://support.google.com/business/answer/1", "https://www.tripadvisor.com/x"]);
  addRun(d1, 3, "google_ai_overview", OCT1 + 86400, ["https://www.google.com/searchviewer/2"]); // outside the window
  const ev = await priorGoogleLinkEvidence(d1.env, SLUG, SEP1, OCT1);
  assert.deepEqual([...ev!.entries()], [[AIO, 2]], "Gemini's redirect host and Google's own pages are not wrappers");
});

// ── The readout ───────────────────────────────────────────────────────────

const SEPT_FACTS = (basis?: string) => JSON.stringify({
  engines: [
    { name: AIO, pct: 2 }, { name: "Perplexity", pct: 5 },
    { name: "Claude", pct: 10, layer: "model_knowledge" }, { name: "Bing search (control)", pct: 1 },
  ],
  ...(basis ? { linkBasis: basis } : {}),
});

async function readoutDb(priorFacts: string, hook?: (sql: string) => void) {
  const d1 = await openD1(SCHEMA, hook ? (sql) => hook(sql) : undefined);
  if (!d1) return null;
  await seed(d1);
  const eb = JSON.stringify({
    [AIO]: { citations: 1, total: 10, share_pct: 10, cohort_citations: 2, layer: "citation" },
    Perplexity: { citations: 2, total: 20, share_pct: 10, cohort_citations: 3, layer: "citation" },
    Claude: { citations: 3, total: 10, share_pct: 30, cohort_citations: 4, layer: "model_knowledge" },
    "Bing search (control)": { citations: 0, total: 5, share_pct: 0, cohort_citations: 1, layer: "citation" },
  });
  const tc = JSON.stringify({
    htc_venue_share_pct: 20, competitors: [], source_types: {}, offsite_hosts: [], link_basis: LINK_BASIS,
    source_exclusions: { google_wrapper_links: 3, google_wrapper_links_resolved: 0, wrapper_links_by_engine: { [AIO]: 3 } },
  });
  d1.db.prepare(`INSERT INTO citation_snapshots (client_slug, week_start, total_queries, client_citations, citation_share,
      top_competitors, keyword_breakdown, engines_breakdown, created_at, measured_at) VALUES (?, ?, 3, 1, 0.1, ?, '{}', ?, ?, ?)`)
    .run(SLUG, NOV1 - 1, tc, eb, NOV1 + 3600, NOV1 + 3600);
  d1.db.prepare("INSERT INTO monthly_memos (client_slug, month_key, title, body_markdown, delivered_at, facts_json) VALUES (?, '2026-09', 't', 'b', ?, ?)")
    .run(SLUG, OCT1 + 86400, priorFacts);
  // September: AI Overviews listed wrappers, Perplexity did not.
  addRun(d1, 1, "google_ai_overview", SEP1 + 86400, ["https://www.google.com/searchviewer/1?svid=x"]);
  addRun(d1, 1, "perplexity", SEP1 + 86400, ["https://www.tripadvisor.com/x"]);
  for (const e of ["google_ai_overview", "perplexity", "anthropic", "bing"]) for (const k of [1, 2, 3]) addRun(d1, k, e, OCT1 + k * 86400, []);
  return d1;
}

test("the readout withholds AI Overviews' 'from' dot across the change, keeps the rest, and says why", async (t) => {
  const d1 = await readoutDb(SEPT_FACTS());
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  const by = (n: string) => f.engines.find((e) => e.name === n)!;
  assert.equal(by(AIO).prev, undefined, "no comparison across the basis change");
  assert.equal(by(AIO).prevWithheld, LINK_MOVEMENT_WITHHELD);
  assert.equal(by("Perplexity").prev, 5, "no wrapper in either month: comparable");
  assert.equal(by("Claude").prev, 10, "answers naming the client are not link shares");
  assert.equal(by("Bing search (control)").prev, 1, "the control's total keeps every result");
  assert.equal(f.linkBasis, LINK_BASIS);
  assert.equal(f.linkBasisNote, "Google AI Overviews' link count leaves out Google's own viewer links.");
});

test("next month, on the same basis, the comparison comes back", async (t) => {
  const d1 = await readoutDb(SEPT_FACTS(LINK_BASIS));
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.equal(f.engines.find((e) => e.name === AIO)!.prev, 2);
  assert.equal(f.engines.find((e) => e.name === AIO)!.prevWithheld, undefined);
});

test("unreadable evidence withholds every search tool's 'from' dot, never states one", async (t) => {
  const d1 = await readoutDb(SEPT_FACTS(), (sql) => { if (sql.includes("://www.google.%")) throw new Error("D1_ERROR: simulated"); });
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.equal(f.engines.find((e) => e.name === "Perplexity")!.prevWithheld, LINK_MOVEMENT_WITHHELD);
  assert.equal(f.engines.find((e) => e.name === "Claude")!.prev, 10);
});

test("the dumbbell draws no 'from' dot for a withheld tool and discloses the change once", () => {
  const html = renderCharts(JSON.stringify({
    prior_label: "Sep 2026",
    engines: [
      { name: "Perplexity", pct: 10, prev: 5, layer: "citation" },
      { name: AIO, pct: 10, prevWithheld: LINK_MOVEMENT_WITHHELD, layer: "citation" },
    ],
    linkBasisNote: "Google AI Overviews' link count leaves out Google's own viewer links.",
  }));
  assert.equal((html.match(/dumb-dot prev/g) ?? []).length, 1, "one hollow dot, Perplexity's");
  assert.equal((html.match(/link count leaves out Google&#39;s own viewer links|link count leaves out Google's own viewer links/g) ?? []).length, 1);
  assert.match(html, /Google AI Overviews shows this month only\. Not compared with last month/);
  // A tool with no prior at all is no longer drawn rising from zero either.
  const fresh = renderCharts(JSON.stringify({ engines: [{ name: "Perplexity", pct: 10, prev: 5 }, { name: "New tool", pct: 4 }] }));
  assert.equal((fresh.match(/dumb-dot prev/g) ?? []).length, 1);
  assert.match(fresh, /New tool shows this month only\. There is no reading from last month to compare it with\./);
});

test("an analyst note may not describe a withheld tool's move, even without digits", () => {
  const facts = {
    period_label: "Oct 2026", engines: [
      { name: "Perplexity", pct: 10, prev: 5 },
      { name: AIO, pct: 10, prevWithheld: LINK_MOVEMENT_WITHHELD },
    ], venue: { rows: [] }, sources: [], topSources: [],
  } as never;
  assert.equal(engineNoteClaimsOk("Google AI Overviews rose sharply this month.", facts), false);
  assert.equal(engineNoteClaimsOk("Google AI Overviews pulled 10 percent of its pages from your site.", facts), true);
  assert.equal(engineNoteClaimsOk("Perplexity rose from 5 to 10 percent.", facts), true);
});

// ── The memo ──────────────────────────────────────────────────────────────

test("the memo withholds a link-share delta across the change and carries the disclosure", async (t) => {
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  await seed(d1);
  addRun(d1, 1, "google_ai_overview", SEP1 + 86400, ["https://www.google.com/searchviewer/1?svid=x"]);
  addRun(d1, 1, "perplexity", SEP1 + 86400, ["https://example-hotel.test/x"], 1);
  addRun(d1, 1, "perplexity", OCT1 + 86400, ["https://example-hotel.test/x"], 1);
  const snap = (ws: number, aio: number, extra: Record<string, unknown>) => d1.db.prepare(`INSERT INTO citation_snapshots
      (client_slug, week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, created_at, measured_at)
      VALUES (?, ?, 3, 1, 0.1, ?, '{}', ?, ?, ?)`).run(SLUG, ws,
    JSON.stringify({ htc_venue_share_pct: 20, competitors: [{ domain: "rival-inn.test", label: "Rival Inn", citations: 4 }], source_types: {}, offsite_hosts: [], ...extra }),
    JSON.stringify({ [AIO]: { citations: 1, total: 10, share_pct: aio, cohort_citations: 2, layer: "citation" }, Perplexity: { citations: 2, total: 20, share_pct: aio === 37 ? 6 : 11, cohort_citations: 3, layer: "citation" } }),
    ws + 3600, ws + 3600);
  snap(at("2026-09-28T00:00:00Z"), 37, {}); // September, every link counted
  snap(NOV1 - 1, 13, { link_basis: LINK_BASIS, snapshot_kind: "month_end", window: { start: OCT1, end: NOV1 },
    source_exclusions: { wrapper_links_by_engine: { [AIO]: 3 } } });
  const inp = await gatherMemoInputs(d1.env, SLUG, new Date((NOV1 - 1) * 1000), { monthEndSnapshot: true });
  const aio = inp.by_engine.find((e) => e.engine === AIO)!;
  assert.equal(aio.movement_withheld, LINK_MOVEMENT_WITHHELD);
  assert.equal(aio.prior_share_pct, null);
  assert.equal(aio.delta_pp, null);
  const p = inp.by_engine.find((e) => e.engine === "Perplexity")!;
  assert.equal(p.movement_withheld, undefined);
  assert.equal(p.prior_share_pct, 6);
  assert.equal(p.delta_pp, 5);
  assert.equal(inp.link_count_basis, "Google AI Overviews' link count leaves out Google's own viewer links.");
  assert.equal(allowedNumberSet(inp).has("37"), false, "a withheld prior must not verify");
});

test("the writer is told never to compare a link share across the change", () => {
  const src = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  assert.match(src, /LINK SHARES ARE NEVER COMPARED ACROSS A CHANGE IN HOW LINKS ARE COUNTED/);
  assert.match(src, /data\.link_count_basis, when present, is one sentence/);
  assert.match(src, /INPUT_CONTRACT_REVISION = "2026-10-05\.[^"]*link-basis/);
  const notes = fs.readFileSync(new URL("../src/lib/report-notes.ts", import.meta.url), "utf8");
  assert.match(notes, /CRITICAL, WITHHELD COMPARISONS/);
});

/* 2026-10-05 audit: a whole-percent bound must still hold.
 *
 * The readout's naming facts and the memo's naming fields were rounded to the
 * nearest whole percent (the memo to one decimal), so a floor could be
 * overstated and a ceiling understated: 945 named of 2,375 answers is 39.79%,
 * and "at least 40%" is false. Floors now round down and ceilings round up,
 * from one helper, and a month with nothing unread is one figure, the share
 * rounded, never a range made by rounding alone.
 *
 * Fictional business throughout: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wholePercentBounds, RESPONSE_TEXT_CAP } from "../src/lib/answer-presence";
import { namedBounds, gatherMemoInputs, type MemoInputs } from "../src/lib/memo-inputs";
import { allowedNumberSet } from "../src/lib/memo-generator";
import { buildReportFacts } from "../src/lib/report-facts";
import { renderCharts } from "../src/routes/customer-readouts";
import { openD1, SCHEMA, type SqliteD1 } from "./support/d1-sqlite";

/** [named, unknown, total, floor, ceiling] */
const CASES: Array<[number, number, number, number, number]> = [
  [945, 214, 2375, 39, 49],
  [87, 42, 312, 27, 42],
  [239, 102, 539, 44, 64],
  [300, 0, 769, 39, 39],
];

test("floors round down and ceilings round up, so 'at least' and 'up to' hold", () => {
  for (const [named, unknown, total, floor, ceiling] of CASES) {
    const b = wholePercentBounds(named, unknown, total)!;
    assert.deepEqual(b, { floorPct: floor, ceilingPct: ceiling }, `${named}/${total} with ${unknown} unread`);
    if (unknown > 0) {
      assert.ok(b.floorPct <= (100 * named) / total, "the floor is not above the exact floor");
      assert.ok(b.ceilingPct >= (100 * (named + unknown)) / total, "the ceiling is not below the exact ceiling");
    }
  }
  // The rounding this replaces, and why it was false.
  assert.equal(Math.round((100 * 945) / 2375), 40, "39.79% printed as 'at least 40%'");
  assert.equal(Math.round((100 * 87) / 312), 28, "27.88% printed as 'at least 28%'");
  assert.equal(Math.round((100 * (87 + 42)) / 312), 41, "41.35% printed as 'up to 41%'");
});

test("nothing unread is one figure and never a range, anything unread is always a range", () => {
  for (let total = 1; total <= 120; total++) {
    for (let named = 0; named <= total; named++) {
      const exact = wholePercentBounds(named, 0, total)!;
      assert.equal(exact.floorPct, exact.ceilingPct, `${named}/${total}: no range from rounding alone`);
      assert.equal(exact.floorPct, Math.round((100 * named) / total));
      if (named < total) {
        const ranged = wholePercentBounds(named, 1, total)!;
        assert.ok(ranged.floorPct < ranged.ceilingPct, `${named}/${total} with one unread`);
        assert.ok(ranged.floorPct <= (100 * named) / total && ranged.ceilingPct >= (100 * (named + 1)) / total);
      }
    }
  }
});

test("a share that is exactly a whole percent is not knocked off it by floating point", () => {
  // (29 / 100) * 100 is 28.999..., which would floor to 28.
  assert.ok((29 / 100) * 100 < 29);
  assert.deepEqual(wholePercentBounds(29, 1, 100), { floorPct: 29, ceilingPct: 30 });
  // (56 / 100) * 100 is 56.000...01, which would ceil to 57.
  assert.ok((56 / 100) * 100 > 56);
  assert.deepEqual(wholePercentBounds(55, 1, 100), { floorPct: 55, ceilingPct: 56 });
});

test("no answers is no figure, not zero", () => {
  assert.equal(wholePercentBounds(0, 0, 0), null);
  assert.equal(namedBounds(0, 0, 0).named_floor_pct, null);
  assert.equal(namedBounds(0, 0, 0).named_ceiling_pct, null);
});

test("the memo's naming fields follow the same rule", () => {
  for (const [named, unknown, total, floor, ceiling] of CASES) {
    assert.deepEqual(namedBounds(named, unknown, total), {
      named_runs: named, named_unknown_runs: unknown, named_total_runs: total,
      named_floor_pct: floor, named_ceiling_pct: ceiling,
    });
  }
});

test("the number guard accepts the floor and the ceiling, and nothing rounded past them", () => {
  const inp = {
    overall: { current: { runs: 0, cited: 0, share_pct: 0 }, prior: { runs: 0, cited: 0, share_pct: 0 }, share_delta_pp: 0 },
    cohort: { rank: null, members: [], customer_mentions: 0 },
    by_engine: [], by_category: [], offsite: { source_types: [], hosts: [] },
    by_question: [{ current_pct: 0, prior_pct: null, delta_pp: null, current_runs: 2375, ...namedBounds(945, 214, 2375) }],
  } as unknown as MemoInputs;
  const allowed = allowedNumberSet(inp);
  for (const n of ["39", "49"]) assert.ok(allowed.has(n), `${n} must verify`);
  // 39.8 was the old one-decimal floor, and its rounding let "40" verify.
  for (const n of ["40", "39.8", "48.8", "48"]) assert.equal(allowed.has(n), false, `${n} must not verify`);
});

test("the prompt takes 'at least' only from a floor field and 'up to' only from a ceiling field", () => {
  const src = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  assert.match(src, /"AT LEAST" COMES ONLY FROM A FLOOR FIELD AND "UP TO" ONLY FROM A CEILING FIELD/);
  assert.match(src, /Write "at least X%" only when X is that row's named_floor_pct, and "up to Y%" only when Y is that row's named_ceiling_pct/);
  assert.match(src, /never round them again/);
  assert.match(src, /When named_unknown_runs is 0 the single figure is the share itself, rounded, not a floor/);
  assert.match(src, /INPUT_CONTRACT_REVISION = "2026-10-05\.[^"]*whole-percent-bounds/);
});

// ── One month, end to end: the readout and the memo ─────────────────────────

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const AUG1 = at("2026-08-01T00:00:00Z");
const OCT1 = at("2026-10-01T00:00:00Z");
const NOV1 = at("2026-11-01T00:00:00Z");
const SLUG = "harbor-lights";
const NAMED = "For a quiet stay, Harbor Lights Hotel is a good pick.";
const NOT_NAMED = "Several hotels near the marina have rooftop pools.";
const CUT = "x".repeat(RESPONSE_TEXT_CAP); // held only in part, name not found

/** One search tool's October: `named` answers name the business, `unknown`
 *  were cut off at the storage cap, the rest do not name it. */
async function month(named: number, unknown: number, total: number): Promise<SqliteD1 | null> {
  const d1 = await openD1(SCHEMA);
  if (!d1) return null;
  const ins = (sql: string, ...a: unknown[]) => d1.db.prepare(sql).run(...a);
  ins("INSERT INTO measurement_registry VALUES (?, 1, 'sweep', ?)", SLUG, AUG1);
  ins("INSERT INTO customers (client_slug, name, status) VALUES (?, 'Harbor Lights Hotel', 'active')", SLUG);
  ins("INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active) VALUES (?, 'harbor-lights.test', 0, NULL, 1)", SLUG);
  for (let k = 1; k <= 3; k++) ins("INSERT INTO citation_keywords (id, client_slug, keyword, category, active) VALUES (?, ?, ?, 'client', 1)", k, SLUG, `q${k}`);
  d1.db.prepare(`INSERT INTO citation_snapshots (client_slug, week_start, total_queries, client_citations, citation_share,
      top_competitors, keyword_breakdown, engines_breakdown, created_at, measured_at) VALUES (?, ?, 3, 1, 0.1, ?, '{}', ?, ?, ?)`)
    .run(SLUG, NOV1 - 1,
      JSON.stringify({ htc_venue_share_pct: 20, competitors: [], source_types: {}, offsite_hosts: [] }),
      JSON.stringify({ Perplexity: { citations: 2, total: 20, share_pct: 10, cohort_citations: 3, layer: "citation" } }),
      NOV1 + 3600, NOV1 + 3600);
  const run = d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (?, 'perplexity', 0, '[]', '[]', ?, ?)");
  d1.db.exec("BEGIN");
  for (let i = 0; i < total; i++) {
    const text = i < named ? NAMED : i < named + unknown ? CUT : NOT_NAMED;
    run.run((i % 3) + 1, text, OCT1 + 3600 + (i % 28) * 86400 + i);
  }
  d1.db.exec("COMMIT");
  return d1;
}

const readerText = (html: string) => html
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/g, " ")
  .replace(/\s+/g, " ");

test("the readout and the memo state the same bounds on the same month, and the page says 'at least 39%'", async (t) => {
  const d1 = await month(945, 214, 2375);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.deepEqual(f.presence!.overall, { floorPct: 39, ceilingPct: 49, unknown: 214, total: 2375 });
  assert.deepEqual(f.presence!.engines, [{ name: "perplexity", floorPct: 39, ceilingPct: 49, unknown: 214, total: 2375 }]);

  const inp = await gatherMemoInputs(d1.env, SLUG, new Date((NOV1 - 1) * 1000));
  const eng = inp.by_engine.find((e) => /perplexity/i.test(e.engine))!;
  assert.equal(eng.named_floor_pct, 39);
  assert.equal(eng.named_ceiling_pct, 49);

  assert.equal(f.presence!.rounding, "outward");
  const text = readerText(renderCharts(JSON.stringify(f)));
  assert.match(text, /the answer was yes on at least 39% of answers/);
  assert.match(text, /would take the figure up to 49%/, "a ceiling rounded up is stated as a bound");
  assert.match(text, /39% of answers from AI tools that search the web name you at least, across 2,375 answers/);
  assert.doesNotMatch(text, /at least 40%/);
  // Facts frozen before the change carry no marker: their ceiling was rounded
  // to the nearest whole percent, so it keeps the sentence it was shown with.
  const frozen = { ...f, presence: { engines: f.presence!.engines, overall: f.presence!.overall } };
  assert.match(readerText(renderCharts(JSON.stringify(frozen))), /would put the figure at 49%/);
});

test("with nothing unread the page states the share, never 'at least' it", async (t) => {
  // 39.79% exactly, rounded to 40: true as the share, false as a floor.
  const d1 = await month(945, 0, 2375);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const f = (await buildReportFacts(d1.env, SLUG, "2026-10"))!;
  assert.deepEqual(f.presence!.overall, { floorPct: 40, ceilingPct: 40, unknown: 0, total: 2375 });
  const text = readerText(renderCharts(JSON.stringify(f)));
  assert.match(text, /the answer was yes on 40% of answers\. We kept all 2,375 answers in full, so this is the whole count, not a floor\./);
  assert.match(text, /40% of answers from AI tools that search the web name you across 2,375 answers/);
  assert.doesNotMatch(text, /at least 40%|name you at least|"At least" is a floor/);
  assert.doesNotMatch(text, /[—;]/, "no em dash, no semicolon in what the reader sees");
});

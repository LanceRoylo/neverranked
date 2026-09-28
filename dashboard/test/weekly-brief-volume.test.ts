/* The weekly brief renders the shared comparison and computes nothing itself.
 *
 * The RULES (shared question set, volume skew, mix shift, opposite directions,
 * absence is not a zero) are tested in compare-periods.test.ts, which is the
 * point of having a primitive. What is tested here is that this brief renders
 * it faithfully and adds the two labels the published artifact needs.
 *
 * All fixtures are real, from D1 on 2026-09-27.
 *
 * The defect this file now guards against is the fourth in one day, and it was
 * mine: after fixing question set, volume and mix, the pooled figure STILL had
 * no engine filter. It averaged citation-grade and model-knowledge surfaces
 * together with the Bing control in the denominator, and for the week of 09-14
 * that publishes "down 1.2 points" when citation-grade was down 2.6 and
 * model-knowledge was up 0.2.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weekOverWeekBlock, sumHits, type WeeklyStats } from "../src/weekly-brief-generator";
import { computeComparison, type SurfaceCounts } from "../src/lib/compare-periods";

const SRC = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");

/* Week of 2026-09-14 against the prior week, over the 67 questions in both. */
const DRAFT_3: SurfaceCounts[] = [
  { engine: "anthropic",          prevRuns: 471, prevHits: 84,  curRuns: 448, curHits: 82 },
  { engine: "bing",               prevRuns: 469, prevHits: 0,   curRuns: 472, curHits: 1 },
  { engine: "gemini",             prevRuns: 471, prevHits: 132, curRuns: 448, curHits: 101 },
  { engine: "gemma",              prevRuns: 456, prevHits: 99,  curRuns: 464, curHits: 100 },
  { engine: "google_ai_overview", prevRuns: 258, prevHits: 32,  curRuns: 227, curHits: 31 },
  { engine: "openai",             prevRuns: 322, prevHits: 53,  curRuns: 472, curHits: 75 },
  { engine: "perplexity",         prevRuns: 470, prevHits: 104, curRuns: 475, curHits: 93 },
];

const WINDOWS = {
  curWindow: { start: 1789344000, end: 1789948800 },
  prevWindow: { start: 1788739200, end: 1789344000 },
};

const blockFor = (perSurface: SurfaceCounts[], sharedKeywords = 67): string => {
  const comparison = computeComparison({ sharedKeywords, perSurface, ...WINDOWS });
  return weekOverWeekBlock({ comparison, sharedKeywords } as unknown as WeeklyStats);
};

test("the two layers are reported separately and never averaged", () => {
  const b = blockFor(DRAFT_3);
  assert.match(b, /NOT comparable to each other/);
  assert.match(b, /Surfaces that search the web and cite sources/);
  assert.match(b, /Surfaces that answer from training/);
  // The figure that used to headline this block. 17.3 -> 16.1 averaged both
  // layers and the control; it may never appear again.
  assert.doesNotMatch(b, /17\.3% to 16\.1%/);
  assert.doesNotMatch(b, /down 1\.2 percentage points/);
});

test("the citation layer is withheld for the openai mix shift", () => {
  const b = blockFor(DRAFT_3);
  assert.match(b, /Surfaces that search the web and cite sources: no movement can be stated/);
  assert.match(b, /openai/);
  assert.match(b, /47%/);
});

test("the model-knowledge layer is stated, on its own denominators", () => {
  const b = blockFor(DRAFT_3);
  // 183 of 927 against 182 of 912.
  assert.match(b, /Surfaces that answer from training:\s+19\.7% to 20\.0%/);
});

test("each surface keeps its own rate and its own denominators", () => {
  const b = blockFor(DRAFT_3);
  assert.match(b, /gemini\s+28\.0% -> 22\.5%\s+\(-5\.5pp, 471 -> 448 runs\)/);
  assert.match(b, /anthropic\s+17\.8% -> 18\.3%\s+\(\+0\.5pp/);
  assert.match(b, /322 -> 472 runs/);
  assert.match(b, /Surfaces that moved at least 2 points: gemini down 5\.5pp, perplexity down 2\.5pp/);
});

test("the control and the by-design denominator keep their labels", () => {
  const b = blockFor(DRAFT_3);
  assert.match(b, /bing[^\n]*classic-search CONTROL/);
  assert.match(b, /It does not cite or answer/);
  assert.match(b, /google_ai_overview[^\n]*smaller denominator BY DESIGN/);
  assert.match(b, /NOT missing coverage/);
  assert.doesNotMatch(b, /gemini[^\n]*BY DESIGN/);
});

test("the control never appears in the moved list, however far it swings", () => {
  const b = blockFor([
    { engine: "bing",   prevRuns: 400, prevHits: 20, curRuns: 400, curHits: 100 },
    { engine: "gemini", prevRuns: 400, prevHits: 80, curRuns: 400, curHits: 82 },
  ], 20);
  assert.match(b, /bing[^\n]*\(\+20\.0pp/, "its numbers still show");
  assert.doesNotMatch(b, /moved at least 2 points: bing/);
});

test("a withheld surface is rendered as a refusal, never as a number", () => {
  const b = blockFor([
    { engine: "gemma",  prevRuns: 0,   prevHits: 0,  curRuns: 500, curHits: 90 },
    { engine: "gemini", prevRuns: 400, prevHits: 80, curRuns: 400, curHits: 82 },
  ], 20);
  assert.match(b, /gemma\s+no movement may be stated: not measured in the prior window/);
  assert.doesNotMatch(b, /gemma\s+0\.0% ->/);
});

test("no shared question withholds the whole block", () => {
  const b = blockFor(DRAFT_3, 0);
  assert.match(b, /NO comparable prior week/);
  assert.match(b, /you may not state or imply one/);
});

test("the model is told not to recompute a refused figure itself", () => {
  const b = blockFor(DRAFT_3);
  assert.match(b, /you may not work around/);
  assert.match(b, /comparing the raw counts yourself/);
});

test("the headline citation count excludes the control", () => {
  const c = computeComparison({ sharedKeywords: 67, perSurface: DRAFT_3, ...WINDOWS });
  // 483 total includes bing's single hit; the reported figure must not.
  assert.equal(sumHits(c, "cur"), 482);
  assert.equal(sumHits(c, "prev"), 504);
});

test("this file no longer computes a comparison of its own", () => {
  // Every rule lives in the primitive now. A second private copy of this
  // knowledge is the bug that keeps recurring.
  assert.doesNotMatch(SRC, /const volSkew\s*=/, "volume logic belongs to the primitive");
  assert.doesNotMatch(SRC, /VOLUME WARNING/, "the primitive states its own refusals");
  assert.match(SRC, /computeComparison\(/);
  assert.match(SRC, /describeMovement\(/);
});

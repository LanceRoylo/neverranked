/* The public weekly brief may not report our own instrument as a market move.
 *
 * The week-over-week citation delta was two raw sums over citation_runs, with
 * no join and no scoping, so any question measured in one week and not the
 * other moved the total. Totals went 827, then 578, then 483, and two drafts
 * sat in the review queue calling it a citation decline.
 *
 * This brief PUBLISHES at /weekly/<slug>. That would have put a claim about the
 * AI citation landscape in public whose every cause was ours, from a practice
 * that sells measurement integrity. Same shape as the retracted 45-to-95.
 *
 * The causes, measured from D1 on 2026-09-27 rather than assumed: and-scene went
 * DARK on 09-09, five days before its 09-14 cost pause and undetected at the
 * time; the week BEFORE was inflated by extra sweeps on 09-01 to 09-03, so
 * hawaii-theatre's apparent loss is a high baseline and not starvation; the
 * engine mix shifted as openai recovered from an outage, and it cites least of
 * the six; and hawaii-theatre's 25-to-18 cut on 09-21 lands in the later window.
 *
 * Earlier versions of this comment blamed the 09-14 pause for a fall that
 * preceded it, then blamed sweep starvation that was not happening. Both were
 * inferred from notes instead of measured. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");

test("the delta is computed over questions measured in BOTH weeks", () => {
  assert.match(SRC, /INTERSECT/, "the two windows must be intersected on keyword");
  assert.match(SRC, /keyword_id IN \(SELECT keyword_id FROM both\)/);
});

test("the unscoped raw sums are gone", () => {
  const raw = SRC.match(/FROM citation_runs WHERE run_at >= \? AND run_at < \?`,?\s*\)\s*\.bind\((start|prevStart)/g) || [];
  assert.equal(raw.length, 0, "a bare windowed sum over all runs must not return");
});

test("no shared questions means no delta, not a zero", () => {
  // The refusal now lives in comparePeriods(), which this file hands the
  // shared-keyword count and nothing else. Asserting the old private
  // expression would pin an implementation that deliberately no longer exists.
  assert.match(SRC, /sharedKeywords = kwRow\?\.shared_keywords \?\? 0/);
  assert.match(SRC, /no keywords measured in both weeks/);
  assert.match(SRC, /NO comparable prior week/);
  assert.match(SRC, /you may not state or imply one/i);
});

test("the basis travels with the number into the prompt", () => {
  // A delta whose basis is invisible is how a set change gets published as a
  // market movement. The basis is three things now, not one: which questions,
  // how many times each was asked, and which LAYER the figure belongs to.
  // All three are carried by ComparisonResult rather than by loose fields here.
  assert.match(SRC, /measured in BOTH weeks/);
  assert.match(SRC, /comparison: ComparisonResult;/, "the basis must be part of the stats contract");
  assert.match(SRC, /prevRuns\} -> \$\{s\.curRuns\} runs/, "per-surface denominators are printed");
  assert.match(SRC, /NOT comparable to each other/, "the two layers are never averaged");
});

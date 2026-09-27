/* The public weekly brief may not report our own instrument as a market move.
 *
 * The week-over-week citation delta was two raw sums over citation_runs, with
 * no join and no scoping, so any question measured in one week and not the
 * other moved the total. Every such change in September 2026 was ours.
 *
 * Which ones, measured from D1 on 2026-09-27 rather than assumed: and-scene
 * went DARK on 09-09, five days before the 09-14 cost pause and undetected at
 * the time; hawaii-theatre lost runs to sweep-order starvation as prince's set
 * grew; openai and google_ai_overview both ran short; and hawaii-theatre's
 * 25-to-18 cut on 09-21 lands in the later window. The first version of this
 * comment blamed the 09-14 pause for a fall that preceded it.
 *
 * Totals went 827, then 578, then 483, and two drafts sat in the review queue
 * calling it a citation decline. This brief PUBLISHES at /weekly/<slug>, so
 * that would have put a claim about the AI citation landscape in public whose
 * whole cause was us turning measurement off. Same shape as the retracted
 * 45-to-95 figure, from a practice that sells measurement integrity. */
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
  assert.match(SRC, /sharedKeywords > 0 \? \(lfl\?\.cur \?\? 0\) : 0/);
  assert.match(SRC, /NO comparable prior week/);
  assert.match(SRC, /you may not state or imply one/i);
});

test("the basis travels with the number into the prompt", () => {
  // A delta whose basis is invisible is how a set change gets published as a
  // market movement.
  assert.match(SRC, /measured in BOTH weeks/);
  assert.match(SRC, /sharedKeywords: number;/, "the basis must be part of the stats contract");
  // The basis is now two things, not one: which questions, and how many times
  // each was asked. Scoping the questions alone still let a 23% swing in run
  // volume publish as a citation decline. See weekly-brief-volume.test.ts.
  assert.match(SRC, /sharedRunsCur: number;/, "the denominator must travel too");
  assert.match(SRC, /sharedRunsPrev: number;/);
});

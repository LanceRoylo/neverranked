/* The reporting period is the calendar month, and a missing prior is not a
 * flat month.
 *
 * gatherMemoInputs used a trailing 30 days while buildReportFacts used the
 * calendar month, and the prose called both "this month". They coincided in
 * September 2026 only because prince-waikiki started measuring on the 1st, so
 * every figure reconciled and nothing looked wrong. In October a memo
 * generated on the 24th would compute prose over Sep 24 to Oct 24 while its
 * charts covered October.
 *
 * Separately, a missing prior fell back to the CURRENT share, so the delta
 * computed to zero and the month read as "held flat" when nothing had been
 * compared. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const INPUTS = fs.readFileSync(new URL("../src/lib/memo-inputs.ts", import.meta.url), "utf8");
const GEN = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");

test("the window is the calendar month, not a trailing 30 days", () => {
  assert.doesNotMatch(INPUTS, /const curStart = nowTs - 30 \* DAY/,
    "the trailing-30 window must not return");
  assert.match(INPUTS, /startOfMonthUTC/);
  assert.match(INPUTS, /const monthStart = startOfMonthUTC\(now\)/);
});

test("measurement_start is a floor on the window, not a later filter", () => {
  assert.match(INPUTS, /Math\.max\(monthStart, mStart\)/,
    "pre-engagement runs must never enter a figure");
});

test("a prior period opening before the engagement is not used as a prior", () => {
  assert.match(INPUTS, /prevMonthStart < mStart \? curStart : prevMonthStart/);
});

test("a missing prior is flagged on both the snapshot and run-based paths", () => {
  const hits = INPUTS.match(/prior_missing: true/g) || [];
  assert.equal(hits.length, 2, `both paths must flag it, found ${hits.length}`);
});

test("the prompt forbids flat-month language when the prior is missing", () => {
  assert.match(GEN, /prior_missing/);
  for (const phrase of ["held flat", "stayed level", "was unchanged", "did not move"]) {
    assert.ok(GEN.includes(phrase), `the prompt must name "${phrase}" as forbidden`);
  }
  assert.match(GEN, /may not state or imply a delta of any size including zero/i);
});

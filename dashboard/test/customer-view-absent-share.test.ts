/* A customer must never be told they hold 0% when the number was not computed.
 *
 * isReadoutShapeSnapshot returns true on engines_breakdown alone, so a
 * snapshot can pass the shape guard while top_competitors carries no venue
 * rollup. `tc.htc_venue_share_pct ?? 0` then rendered "ranked 3 of 35 venues
 * at 0% citation share" on the dashboard: a confident sentence stating the
 * opposite of an unknown.
 *
 * Fifth instance of absence-rendered-as-value in three days, after layer,
 * a missing prior, a question not asked, and an uncounted cadence. The first
 * one aimed straight at a client-facing page. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/routes/customer-view.ts", import.meta.url), "utf8");

test("a missing venue share is detected rather than defaulted", () => {
  assert.match(SRC, /const haveOwnShare = typeof ownShareRaw === "number" && Number\.isFinite\(ownShareRaw\)/);
  assert.doesNotMatch(SRC, /const ownShare = tc\.htc_venue_share_pct \?\? 0;/,
    "the silent default must not return");
});

test("the prose says the standing was not computed instead of printing a zero", () => {
  assert.match(SRC, /was not computed this period/);
  const i = SRC.indexOf("const standingClause");
  assert.ok(i > 0, "the clause must be built conditionally");
  assert.match(SRC.slice(i, i + 200), /!haveOwnShare/, "the absent case must come first");
});

test("rank is withheld too, not just the percentage", () => {
  // Reporting "ranked 3 of 35" off a cohort whose shares are unknown is the
  // same false confidence in a different sentence.
  const i = SRC.indexOf("const standingClause");
  const clause = SRC.slice(i, SRC.indexOf("const baselineStartLine"));
  const absentBranch = clause.slice(0, clause.indexOf("cohortN > 1"));
  assert.doesNotMatch(absentBranch, /myRank/, "the absent branch must not state a rank");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedNumberSet } from "../src/lib/memo-generator";

/* The artifact that nearly shipped.
 *
 * Hawaii Theatre, September 2026. Six questions added on 2026-08-24, 08-31 and
 * 09-07 appeared in the draft as rises "from 0%", and the memo led with an
 * eleven-point overall gain called the largest ever measured for them. On the
 * questions present in both windows the same client was DOWN four points.
 *
 * A question not asked last month has no prior value. Zero is a measurement.
 * Null is the absence of one, and collapsing the second into the first is what
 * turned a decline into a record month. */

const base: any = {
  customer: { client_slug: "x", name: "X", category_label: null, primary_contact_first_name: null },
  cohort: { rank: 1, members: [], customer_mentions: 0 },
  by_engine: [],
  offsite: { source_types: [], hosts: [] },
  overall: { current: { runs: 10, cited: 5, share_pct: 50 }, prior: { runs: 10, cited: 4, share_pct: 40 }, share_delta_pp: 10 },
  questions_count: 2,
};

test("a first reading contributes no prior and no delta to the allowed numbers", () => {
  const inp = {
    ...base,
    by_question: [
      { keyword: "asked both months", category: "a", current_pct: 60, prior_pct: 55, delta_pp: 5, current_runs: 5 },
      { keyword: "added this month", category: "a", current_pct: 60, prior_pct: null, delta_pp: null, first_reading: true, current_runs: 5 },
    ],
  };
  const allowed = allowedNumberSet(inp);
  // The real prior and delta verify.
  assert.ok(allowed.has("55"), "a genuine prior must verify");
  // Nothing from the first reading's absent comparison does.
  assert.ok(!allowed.has("null"), "null must never enter the allowed set");
});

test("like_for_like figures verify when present", () => {
  const inp = {
    ...base,
    by_question: [],
    like_for_like: { questions: 18, current_share_pct: 42.4, prior_share_pct: 46.4, share_delta_pp: -4, questions_added_since_prior: 6 },
  };
  const allowed = allowedNumberSet(inp);
  for (const n of ["18", "42.4", "46.4", "4", "6"]) {
    assert.ok(allowed.has(n), `like-for-like figure ${n} must verify`);
  }
});

test("the real numbers from the incident: a decline is what verifies, not a gain", () => {
  // 46.4 -> 42.4 on the questions measured in both months. The draft said
  // 52 -> 63. If the author writes 63 off this payload it must NOT verify.
  const inp = {
    ...base,
    by_question: [],
    like_for_like: { questions: 18, current_share_pct: 42.4, prior_share_pct: 46.4, share_delta_pp: -4, questions_added_since_prior: 6 },
    overall: { current: { runs: 1, cited: 1, share_pct: 42.4 }, prior: { runs: 1, cited: 1, share_pct: 46.4 }, share_delta_pp: -4 },
  };
  const allowed = allowedNumberSet(inp);
  assert.ok(allowed.has("42.4") && allowed.has("46.4"));
  assert.ok(!allowed.has("63"), "the artifact figure must not verify");
  assert.ok(!allowed.has("52"), "the artifact figure must not verify");
});

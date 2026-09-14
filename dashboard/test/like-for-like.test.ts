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

/* The Prince incident: a stated absence that was not an absence. */
test("group facts verify, and the invented ones do not", () => {
  const inp: any = {
    ...base,
    by_question: [],
    // The real figures: category 'client' is exactly the twelve Hawaii-wide
    // questions, 923 runs, 6 citations.
    by_category: [
      // Ten of the twelve were never cited, and those ten drew 764 runs. Both
      // are carried so neither has to be worked out: the author wrote 768
      // against its own list's 764 when it had to subtract.
      { category: "client", questions: 12, runs: 923, cited: 6, share_pct: 0.7, questions_never_cited: 10, runs_on_never_cited: 764 },
      { category: "head", questions: 9, runs: 1072, cited: 85, share_pct: 7.9, questions_never_cited: 3, runs_on_never_cited: 220 },
    ],
  };
  const allowed = allowedNumberSet(inp);
  for (const n of ["12", "923", "6", "0.7", "85"]) {
    assert.ok(allowed.has(n), `real group figure ${n} must verify`);
  }
  // The draft said "ten Hawaii-wide questions ... zero times across 781 runs".
  // 781 is the one the author invented outright and it must not verify.
  assert.ok(!allowed.has("781"), "the invented denominator must not verify");
  // The zero split is handed over, so the sentence the memo wants needs no
  // arithmetic: ten of twelve, across 764 runs.
  assert.ok(allowed.has("10") && allowed.has("764"), "the zero split must verify");
  assert.ok(!allowed.has("768"), "the computed-and-wrong total must not verify");
});

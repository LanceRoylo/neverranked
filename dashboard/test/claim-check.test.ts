// Regression tests for the claim checker.
//
// The fixtures are NOT invented. Every "bad" string below is copied verbatim
// from the HTC 2026-08 memo draft that the generator produced on 2026-08-03,
// which passed the hallucination guard (every number in it was real) and was
// caught only by a human reading it. The "good" strings are the corrected
// text that was actually delivered.
//
// The bar this suite enforces:
//   - all three real errors are caught
//   - the corrected text produces ZERO flags
// A checker that fails the second half is worse than none, because a gate
// that cries wolf gets overridden by habit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaims, checkDirection, checkRanking, checkZeroAttribution } from "../src/lib/claim-check";

// Frozen facts as they actually stood for HTC 2026-08 after the Copilot patch.
const FACTS = {
  engines: [
    { name: "Claude", pct: 14, prev: 15 },
    { name: "Perplexity", pct: 7, prev: 12 },
    { name: "Gemini grounded", pct: 9, prev: 8 },
    { name: "Google AI Overviews", pct: 14, prev: 11 },
    { name: "Gemma", pct: 11, prev: 11 },
    { name: "ChatGPT search", pct: 9, prev: 10 },
    { name: "Microsoft Copilot", pct: 0, prev: 1, noCohortSignal: true },
  ],
  venue: {
    rows: [
      { label: "Hawaii Theatre Center", pct: 52 },
      { label: "Blaisdell Center", pct: 13.7 },
      { label: "Diamond Head Theatre", pct: 13.3 },
    ],
  },
};
const F = JSON.stringify(FACTS);

// ── ERROR 1: direction ────────────────────────────────────────────────────
// Verbatim from the bad draft. Share ROSE 48 -> 52; the prose said flat.
const BAD_DIRECTION =
  "This month: neither engine moved. Copilot stayed at 0%, ChatGPT search stayed at 9%, and your overall share held flat at 52%.";

test("catches a flatness claim when the pair actually moved", () => {
  const facts = { engines: [{ name: "overall share", pct: 52, prev: 48 }] };
  const issues = checkDirection(BAD_DIRECTION, facts);
  assert.equal(issues.length, 1, "expected exactly one direction issue");
  assert.match(issues[0].detail, /48% to 52%/);
  assert.ok(BAD_DIRECTION.includes(issues[0].quote), "quote must be verbatim from the body");
});

test("accepts the corrected direction sentence", () => {
  const good = "Your overall share rose from 48% to 52%.";
  assert.deepEqual(checkDirection(good, { engines: [{ name: "share", pct: 52, prev: 48 }] }), []);
});

test("flags a rise described as a fall", () => {
  const s = "Google AI Overviews dropped from 11% to 14% this month.";
  const issues = checkDirection(s, FACTS);
  assert.equal(issues.length, 1);
  assert.match(issues[0].detail, /a rise/);
});

test("accepts a genuine decline", () => {
  // Perplexity really did fall 12 -> 7.
  const s = "Perplexity slipped from 12% to 7% and is the line to watch.";
  assert.deepEqual(checkDirection(s, FACTS), []);
});

// ── ERROR 2: ranking ──────────────────────────────────────────────────────
// Verbatim from the bad draft. 13.7 > 13.3, so the ordinals are inverted.
const BAD_RANKING =
  "Diamond Head Theatre is second at 13.3%, the Blaisdell Center third at 13.7%.";

test("catches an inverted ranking", () => {
  const issues = checkRanking(BAD_RANKING, FACTS);
  assert.equal(issues.length, 1, "expected exactly one ranking issue");
  assert.match(issues[0].detail, /cannot hold a higher share/);
  assert.ok(BAD_RANKING.includes(issues[0].quote));
});

test("accepts the corrected ranking", () => {
  const good = "The Blaisdell Center is second at 13.7%, Diamond Head Theatre third at 13.3%.";
  assert.deepEqual(checkRanking(good, FACTS), []);
});

test("ignores an ordinal with only one percentage", () => {
  assert.deepEqual(checkRanking("You are first in the cohort at 52% of all venue citations.", FACTS), []);
});

// ── ERROR 3: zero attribution ─────────────────────────────────────────────
// Verbatim fragment from the bad draft.
const BAD_ZERO = "Copilot stayed at 0%, ChatGPT search stayed at 9%.";

test("catches a no-cohort-signal engine reported as a zero", () => {
  const issues = checkZeroAttribution(BAD_ZERO, FACTS);
  assert.equal(issues.length, 1, "expected exactly one attribution issue");
  assert.match(issues[0].detail, /no venue in the category/);
});

test("catches customer attribution on a dark engine", () => {
  const s = "Microsoft Copilot no longer cites you.";
  assert.equal(checkZeroAttribution(s, FACTS).length, 1);
});

test("accepts the corrected Copilot sentence", () => {
  // This is the language actually delivered.
  const good =
    "Copilot sits outside the chart entirely because no venue in the category appeared on it at all, not you and not any competitor.";
  assert.deepEqual(checkZeroAttribution(good, FACTS), []);
});

test("leaves engines without the flag alone", () => {
  assert.deepEqual(checkZeroAttribution("Gemma held at 11% and you hold steady there.", FACTS), []);
});

// ── whole-body behaviour ──────────────────────────────────────────────────

test("the full bad paragraph trips more than one check", () => {
  const body = `${BAD_DIRECTION}\n\n${BAD_RANKING}`;
  const issues = checkClaims(body, F);
  const kinds = new Set(issues.map((i) => i.kind));
  assert.ok(kinds.has("ranking"), "ranking must be caught");
  assert.ok(kinds.has("attribution"), "attribution must be caught");
  assert.ok(issues.length >= 2, `expected multiple issues, got ${issues.length}`);
  for (const i of issues) assert.ok(body.includes(i.quote), "every quote must be verbatim");
});

test("the delivered corrected body produces zero flags", () => {
  // Condensed from the memo actually delivered on 2026-08-03.
  const body = [
    "## August 2026: what moved",
    "",
    "This month: ChatGPT search slipped a point to 9%, and Copilot sits outside the chart entirely because no venue in the category appeared on it at all, not you and not any competitor. Your overall share rose from 48% to 52%.",
    "",
    "You remain the most-cited performing-arts venue in Honolulu, first in the cohort at 52% of all venue citations. That is up from 48% in July. The Blaisdell Center is second at 13.7%, Diamond Head Theatre third at 13.3%.",
  ].join("\n");
  assert.deepEqual(checkClaims(body, F), [], "corrected text must not flag");
});

test("no facts means no checks, exactly as before this existed", () => {
  assert.deepEqual(checkClaims(BAD_DIRECTION, null), []);
  assert.deepEqual(checkClaims(BAD_DIRECTION, "not json"), []);
  assert.deepEqual(checkClaims("", F), []);
});

test("ambiguous parses stay silent rather than guessing", () => {
  // Two engines share pct 14, so a lone "14%" cannot resolve to one pair.
  const s = "One tool moved up to 14% this month.";
  assert.deepEqual(checkDirection(s, FACTS), []);
});

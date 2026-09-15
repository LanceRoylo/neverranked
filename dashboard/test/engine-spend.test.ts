import { test } from "node:test";
import assert from "node:assert/strict";
import { costOfCall, totalsAreReconciled, RATES } from "../src/lib/engine-spend";

/* What the measurement costs, recorded rather than guessed.
 *
 * The OpenAI balance hit zero on 2026-09-12 and every OpenAI measurement
 * stopped. It was noticed because the instrument went dark, not because
 * anything warned the balance was falling. There was no spend tracking at all.
 *
 * The rule these tests defend: a cost a provider REPORTED and a cost we
 * MODELLED are different kinds of number and may never be silently mixed. */

test("a provider-reported cost wins over the rate table", () => {
  const r = costOfCall({
    engine: "openai",
    inputTokens: 3000,
    outputTokens: 1000,
    providerCostUsd: 0.0123,
  });
  assert.equal(r.costUsd, 0.0123);
  assert.equal(r.basis, "reported");
});

test("a reported cost of ZERO is still reported, not recalculated", () => {
  // DataForSEO refunds the AI Overview surcharge when no overview renders. A
  // refunded call genuinely cost nothing, and a rate table that overrode that
  // with a modelled figure would invent spend that never happened.
  const r = costOfCall({ engine: "google_ai_overview", providerCostUsd: 0 });
  assert.equal(r.costUsd, 0);
  assert.equal(r.basis, "reported");
});

test("token pricing is applied when no provider cost is given", () => {
  // 1M input at $1.25 and 1M output at $10.00 on the search model.
  const r = costOfCall({ engine: "openai", inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(r.costUsd, 11.25);
  assert.equal(r.basis, "estimated");
});

test("an engine with no rate costs a visible zero, not a skipped row", () => {
  // Silently omitting an unpriced engine makes the total look complete when it
  // is not. A zero shows up in the table and invites the question.
  const r = costOfCall({ engine: "bing", inputTokens: 500, outputTokens: 200 });
  assert.equal(r.costUsd, 0);
  assert.equal(r.basis, "estimated");
});

test("Gemini grounding is free inside the daily allowance", () => {
  // 1,500 grounded requests a day are free. Current volume is about 81, so the
  // per-call grounding charge must not be applied.
  const free = costOfCall({ engine: "gemini", inputTokens: 1000, outputTokens: 750, callsSoFarToday: 80 });
  const tokensOnly = (1000 / 1e6) * RATES.gemini.inputPerM + (750 / 1e6) * RATES.gemini.outputPerM;
  assert.ok(Math.abs(free.costUsd - tokensOnly) < 1e-6, `${free.costUsd} should be tokens only`);
});

test("Gemini grounding starts charging past the allowance", () => {
  const paid = costOfCall({ engine: "gemini", inputTokens: 1000, outputTokens: 750, callsSoFarToday: 1500 });
  const free = costOfCall({ engine: "gemini", inputTokens: 1000, outputTokens: 750, callsSoFarToday: 0 });
  assert.ok(paid.costUsd > free.costUsd);
  assert.ok(Math.abs(paid.costUsd - free.costUsd - 0.035) < 1e-6);
});

test("missing usage is treated as zero tokens, never as NaN", () => {
  const r = costOfCall({ engine: "openai" });
  assert.equal(r.costUsd, 0);
  assert.ok(Number.isFinite(r.costUsd));
});

test("negative usage cannot produce a negative cost", () => {
  const r = costOfCall({ engine: "openai", inputTokens: -5000, outputTokens: -1000 });
  assert.equal(r.costUsd, 0);
});

test("nothing is reconciled against a real bill yet, and the code admits it", () => {
  // This test is SUPPOSED to flip when someone opens a billing page and records
  // the date. Until then every estimated total must be labelled indicative.
  assert.equal(totalsAreReconciled(["openai", "gemini", "perplexity"]), false);
  for (const [engine, rate] of Object.entries(RATES)) {
    assert.ok("reconciledAgainstInvoice" in rate, `${engine} must declare its reconciliation state`);
  }
});

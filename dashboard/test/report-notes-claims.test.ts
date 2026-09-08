import { test } from "node:test";
import assert from "node:assert/strict";
import { engineNoteClaimsOk } from "../src/lib/report-notes.ts";

/**
 * The number guard polices digits. This one polices CLAIMS.
 *
 * Found 2026-09-07 by an adversarial audit of the delivery path: the largest
 * figure in a paying client's payload was a model-knowledge share (share of
 * ANSWERS naming them), the prompt asks for "the move that matters most", and
 * nothing prevented "Gemma cites you at 18 percent, far ahead of Perplexity at
 * 2". Every digit in that sentence is measured, so allowedNumbers() passes it.
 * It is still false twice: Gemma cites nothing, and the two figures have
 * different denominators.
 */

const BASELINE_FACTS = {
  engines: [
    { name: "Perplexity", pct: 2, layer: "citation" },
    { name: "ChatGPT search", pct: 4, layer: "citation" },
    { name: "Gemini grounded", pct: 2, layer: "citation" },
    { name: "Google AI Overviews", pct: 1, layer: "citation" },
    { name: "Bing search (control)", pct: 0, layer: "citation" },
    { name: "Claude", pct: 0, layer: "model_knowledge" },
    { name: "Gemma", pct: 18, layer: "model_knowledge" },
  ],
} as never;

const WITH_PRIOR = {
  engines: [
    { name: "Perplexity", pct: 2, prev: 1, layer: "citation" },
    { name: "Gemma", pct: 18, prev: 15, layer: "model_knowledge" },
  ],
} as never;

test("REGRESSION: the exact sentence the audit predicted is rejected", () => {
  assert.equal(
    engineNoteClaimsOk("Gemma cites you at 18 percent, far ahead of Perplexity at 2.", BASELINE_FACTS),
    false,
  );
});

test("a model-knowledge tool is never described as citing", () => {
  for (const bad of [
    "Gemma cited your site more than any other tool this month.",
    "Claude is citing you on very few questions.",
    "Gemma sourced your pages consistently.",
  ]) {
    assert.equal(engineNoteClaimsOk(bad, BASELINE_FACTS), false, `should reject: ${bad}`);
  }
});

test("naming and mentioning ARE the correct verbs and pass", () => {
  assert.equal(
    engineNoteClaimsOk(
      "Gemma names you in 18 percent of its answers, which is a different measurement from the tools that cite sources. Watch whether that holds next month.",
      BASELINE_FACTS,
    ),
    true,
  );
});

test("comparisons across the two layers are rejected", () => {
  for (const bad of [
    "Gemma at 18 beats Perplexity at 2.",
    "Your strongest tool is Gemma, well ahead of ChatGPT search.",
    "Perplexity trails Gemma by a wide margin.",
  ]) {
    assert.equal(engineNoteClaimsOk(bad, BASELINE_FACTS), false, `should reject: ${bad}`);
  }
});

test("comparisons WITHIN the citation layer are fine", () => {
  assert.equal(
    engineNoteClaimsOk("ChatGPT search at 4 percent is ahead of Perplexity at 2 percent.", BASELINE_FACTS),
    true,
  );
});

test("the Bing control is never described as an AI tool that answers or cites", () => {
  for (const bad of [
    "Bing search (control) is the one AI tool that never cites you.",
    "Bing search (control) answers without naming you.",
  ]) {
    assert.equal(engineNoteClaimsOk(bad, BASELINE_FACTS), false, `should reject: ${bad}`);
  }
});

test("movement language in a BASELINE month is rejected even with no digits", () => {
  // The number guard cannot see these: there are no figures to check.
  for (const bad of [
    "Your position improved across the citation-grade tools.",
    "Perplexity slipped this month while the others held steady.",
    "Coverage stayed flat month over month.",
  ]) {
    assert.equal(engineNoteClaimsOk(bad, BASELINE_FACTS), false, `should reject: ${bad}`);
  }
});

test("movement language IS allowed once a prior reading exists", () => {
  assert.equal(
    engineNoteClaimsOk("Perplexity rose from 1 percent to 2 percent.", WITH_PRIOR),
    true,
  );
});

test("a plain baseline description passes", () => {
  assert.equal(
    engineNoteClaimsOk(
      "ChatGPT search points the largest share of its cited sources at your site, at 4 percent. This is your starting position and next month gives it something to compare against.",
      BASELINE_FACTS,
    ),
    true,
  );
});

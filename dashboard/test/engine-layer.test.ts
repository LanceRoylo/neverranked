import { test } from "node:test";
import assert from "node:assert/strict";
import { engineLayer, byLayerThenShare, LAYER_UNITS_NOTE, LAYER1_ENGINE_KEYS } from "../src/lib/engine-layer.ts";

/**
 * atlas-context.ts parsed engines_breakdown into { citations, total,
 * share_pct }, dropping the `layer` buildReadoutSnapshot writes, then sorted
 * all seven surfaces by share into one descending list. So the customer-facing
 * chat received a ranking in which a share of ANSWERS outranked a share of
 * CITED SOURCES, with nothing to say they were different measurements.
 */

test("REGRESSION: both key styles resolve, because Atlas uses both", () => {
  // Snapshot path keys by display label, runs-based fallback by raw engine.
  for (const k of ["perplexity", "openai", "gemini", "google_ai_overview", "bing"]) {
    assert.equal(engineLayer(k), "citation", k);
  }
  for (const l of ["Perplexity", "ChatGPT search", "Gemini grounded", "Google AI Overviews", "Bing search (control)"]) {
    assert.equal(engineLayer(l), "citation", l);
  }
  for (const k of ["anthropic", "gemma", "Claude", "Gemma"]) {
    assert.equal(engineLayer(k), "model_knowledge", k);
  }
});

test("an unrecognised surface is unknown, never guessed", () => {
  // A drifted label must not be asserted into a layer. Claiming a
  // model-knowledge surface cites is the exact error this field prevents.
  for (const x of ["copilot", "ChatGPT", "gemini-grounded", "", "Gemma 2"]) {
    assert.equal(engineLayer(x), "unknown", x);
  }
});

test("REGRESSION: a model-knowledge surface never outranks a citation one", () => {
  // The real September shape: Gemma's 18% is a share of answers, Perplexity's
  // 2% a share of cited sources. Sorted by share alone, Gemma led the list.
  const rows = [
    { engine: "Gemma", share_pct: 18, layer: engineLayer("Gemma") },
    { engine: "Perplexity", share_pct: 2, layer: engineLayer("Perplexity") },
    { engine: "ChatGPT search", share_pct: 4, layer: engineLayer("ChatGPT search") },
    { engine: "Claude", share_pct: 9, layer: engineLayer("Claude") },
  ].sort(byLayerThenShare);

  assert.deepEqual(rows.map((r) => r.engine), ["ChatGPT search", "Perplexity", "Gemma", "Claude"]);
  // Every citation-grade surface precedes every model-knowledge one.
  const lastCitation = rows.map((r) => r.layer).lastIndexOf("citation");
  const firstMemory = rows.map((r) => r.layer).indexOf("model_knowledge");
  assert.ok(lastCitation < firstMemory, "layers must not interleave");
});

test("within a layer, ordering is still by share", () => {
  const rows = [
    { engine: "Perplexity", share_pct: 2, layer: engineLayer("Perplexity") },
    { engine: "ChatGPT search", share_pct: 4, layer: engineLayer("ChatGPT search") },
  ].sort(byLayerThenShare);
  assert.deepEqual(rows.map((r) => r.engine), ["ChatGPT search", "Perplexity"]);
});

test("unknown surfaces sort last rather than into either layer", () => {
  const rows = [
    { engine: "mystery", share_pct: 99, layer: engineLayer("mystery") },
    { engine: "Perplexity", share_pct: 2, layer: engineLayer("Perplexity") },
  ].sort(byLayerThenShare);
  assert.equal(rows[0].engine, "Perplexity");
});

test("the note the chat model reads states the rule, not just the units", () => {
  assert.match(LAYER_UNITS_NOTE, /never be compared, ranked against each other, or summed/);
  assert.match(LAYER_UNITS_NOTE, /share of CITED SOURCES/);
  assert.match(LAYER_UNITS_NOTE, /share of ANSWERS THAT NAMED/);
  // The trap is that the bigger number looks better.
  assert.match(LAYER_UNITS_NOTE, /almost always the larger number/);
  assert.match(LAYER_UNITS_NOTE, /control, not an AI tool/);
});

test("the shared Layer 1 set is exactly the five citation-grade surfaces", () => {
  // citations.ts imports this set, so a change here changes the readout too.
  assert.equal(LAYER1_ENGINE_KEYS.size, 5);
  assert.ok(LAYER1_ENGINE_KEYS.has("bing"), "the control is measured on the citation layer");
  assert.ok(!LAYER1_ENGINE_KEYS.has("gemma"));
  assert.ok(!LAYER1_ENGINE_KEYS.has("anthropic"));
});

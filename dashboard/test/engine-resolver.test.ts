import { test } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_ORDER, resolveEngineKey, canonicalEngineLabel } from "../src/lib/engine-order";

/* The fourteen strings production actually holds.
 *
 * Derived, not guessed: a scan of all 26 rows of
 * citation_snapshots.engines_breakdown on 2026-09-12 returned exactly these.
 * Two writers, two conventions. The dashboard writes raw keys, the forensic
 * bridge writes display labels.
 *
 * If a writer ever emits a spelling that is not here, this test is what should
 * fail. The alternative is what already shipped once: a consumer matches
 * nothing, filters rather than throws, and a customer's chart renders one
 * column short with no error anywhere. */
const PRODUCTION_KEYS = ["perplexity", "openai", "gemini", "anthropic", "google_ai_overview", "bing", "gemma"];
const PRODUCTION_LABELS = ["Perplexity", "Claude", "Gemini grounded", "Google AI Overviews", "Gemma", "ChatGPT search", "Bing search (control)"];

test("every raw key production writes resolves to itself", () => {
  for (const k of PRODUCTION_KEYS) assert.equal(resolveEngineKey(k), k, `key ${k} did not resolve`);
});

test("every display label the forensic bridge writes resolves to a raw key", () => {
  const got = PRODUCTION_LABELS.map((l) => resolveEngineKey(l));
  assert.ok(got.every((k) => k !== null), `unresolved: ${PRODUCTION_LABELS.filter((l) => !resolveEngineKey(l)).join(", ")}`);
  // And they resolve to the SEVEN distinct engines, not several onto one.
  assert.equal(new Set(got).size, 7);
});

test("the two conventions agree with each other, engine for engine", () => {
  assert.deepEqual(
    PRODUCTION_LABELS.map((l) => resolveEngineKey(l)).sort(),
    [...PRODUCTION_KEYS].sort(),
  );
});

test("every key in ENGINE_ORDER is a key the runner actually inserts", () => {
  // google_aio and claude are WRONG. Four generator files in the outreach repo
  // still use them. If one ever migrates into this list, this fails.
  for (const e of ENGINE_ORDER) assert.ok(PRODUCTION_KEYS.includes(e.key), `${e.key} is not a runner key`);
  assert.equal(ENGINE_ORDER.length, PRODUCTION_KEYS.length);
});

test("retired label resolves as input and is never returned as output", () => {
  // Archaeology: an old export may hold it, and reading it must work.
  assert.equal(resolveEngineKey("Microsoft Copilot (Bing)"), "bing");
  assert.equal(resolveEngineKey("Microsoft Copilot"), "bing");
  // But nothing hands it back. Reading a retired label is not emitting one.
  assert.equal(canonicalEngineLabel("Microsoft Copilot (Bing)"), "Bing search (control)");
  for (const e of ENGINE_ORDER) assert.ok(!/copilot/i.test(e.label), `${e.label} names a retired product`);
});

test("the wrong key spellings from the generators still resolve", () => {
  assert.equal(resolveEngineKey("google_aio"), "google_ai_overview");
  assert.equal(resolveEngineKey("claude"), "anthropic");
});

test("case and whitespace do not decide whether a customer sees an engine", () => {
  assert.equal(resolveEngineKey("  chatgpt search  "), "openai");
  assert.equal(resolveEngineKey("PERPLEXITY"), "perplexity");
});

test("an unknown spelling returns null rather than a guess", () => {
  for (const junk of ["", "   ", "Bard", "grok", "ChatGPT Plus"]) {
    assert.equal(resolveEngineKey(junk), null, `"${junk}" should not resolve`);
  }
  // @ts-expect-error deliberately wrong type: callers pass DB values
  assert.equal(resolveEngineKey(null), null);
});

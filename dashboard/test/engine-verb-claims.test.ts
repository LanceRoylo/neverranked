import { test } from "node:test";
import assert from "node:assert/strict";
import { engineVerbClaims, engineVerbClaimsOk } from "../src/lib/engine-verb-claims.ts";

/**
 * neverranked.com/methodology states, as an absolute:
 *
 *   "We do not say an engine 'recommends,' 'prefers,' 'endorses,' or 'ranks'
 *    a business."
 *
 * Until now one of the four verbs was blocked, only inside the Bing-control
 * check, and the monthly memo -- longer, model-written, prescriptive by
 * design -- had no guard at all. An engine returns sources. It does not
 * endorse, and claiming it does asserts intent the instrument cannot see.
 */

const ENGINES = ["Perplexity", "ChatGPT", "Gemini", "Google AIO", "Claude", "Gemma", "Bing search (control)"];

test("REGRESSION: all four verbs are caught, not just 'recommends'", () => {
  for (const bad of [
    "Perplexity recommends them on most questions.",
    "ChatGPT clearly prefers the larger venue here.",
    "Gemini endorses two competitors ahead of you.",
    "Google AIO ranks you third in the category.",
  ]) {
    assert.equal(engineVerbClaimsOk(bad, ENGINES), false, `should reject: ${bad}`);
  }
});

test("the passive form is the same claim and is also caught", () => {
  // Checking only forward would let this through, and it is the phrasing a
  // model reaches for when told to vary its sentences.
  assert.equal(engineVerbClaimsOk("You are consistently recommended by Perplexity.", ENGINES), false);
  assert.equal(engineVerbClaimsOk("The property preferred by Gemini is a competitor.", ENGINES), false);
});

test("OUR OWN ranking is allowed, because the punch list is ordered on purpose", () => {
  // The memo prompt instructs a numbered list in priority order. A blanket
  // word ban would have made the product's own prescription unshippable.
  for (const ok of [
    "The punch list below is ranked by impact and how much you control it.",
    "We rank these four items by speed to fix.",
    "Our recommended order is the one below, and prioritisation is Lance's call.",
  ]) {
    assert.equal(engineVerbClaimsOk(ok, ENGINES), true, `should allow: ${ok}`);
  }
});

test("a forbidden verb far from any engine name does not fire", () => {
  const far =
    "Perplexity cited you on nine of thirty questions this month. " +
    "Separately, and for reasons unrelated to any tool, we rank the FAQ work first because it is fastest.";
  assert.equal(engineVerbClaimsOk(far, ENGINES), true);
});

test("correct verbs about engines pass untouched", () => {
  for (const ok of [
    "Perplexity cited you on nine of thirty questions.",
    "Gemma named you in eighteen percent of its answers.",
    "Bing search (control) returned your page in the top five twice.",
  ]) {
    assert.equal(engineVerbClaimsOk(ok, ENGINES), true, `should allow: ${ok}`);
  }
});

test("the hit names the engine and the verb, so the block message is useful", () => {
  const hits = engineVerbClaims("Gemini prefers the Royal over you.", ENGINES);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].engine, "Gemini");
  assert.match(hits[0].verb, /prefers/i);
  assert.match(hits[0].quote, /Gemini prefers/);
});

test("empty or absent prose is not a violation", () => {
  assert.equal(engineVerbClaimsOk("", ENGINES), true);
  assert.deepEqual(engineVerbClaims("anything at all", []), []);
});

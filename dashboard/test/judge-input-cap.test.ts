/* The judge must read the whole deliverable, and must know when it cannot.
 *
 * The draft was cut at 8,000 characters and the facts at 4,000, silently. On
 * 2026-09-25 prince-waikiki's memo reached 9,232 characters and the judge read
 * it chopped mid-heading at "### O" (character 7,996). It reported "Draft
 * appears truncated at the end, incomplete deliverable" and escalated. The
 * draft was complete and ended correctly on the sign-off. The cut was ours.
 *
 * The quieter half: everything past the cut was never judged, so every prior
 * verdict on a long draft was formed without its closing sections, and every
 * claim check ran against half the facts. The gate looked like it was working
 * the entire time. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/lib/deliverable-judge.ts", import.meta.url), "utf8");

test("the old silent caps are gone from every prompt", () => {
  assert.doesNotMatch(SRC, /slice\(0, 8000\)/, "the 8k draft cut must not return");
  assert.doesNotMatch(SRC, /slice\(0, 4000\)/, "the 4k facts cut must not return");
});

test("both the judge and the verifier clip through the same helper", () => {
  const uses = SRC.match(/clip\(args\.(draftMarkdown|factsJson)/g) || [];
  assert.equal(uses.length, 4, `judge and verifier, draft and facts = 4 call sites, found ${uses.length}`);
});

test("the caps are above any real deliverable", () => {
  const draft = SRC.match(/DRAFT_CAP = ([0-9_]+)/);
  const facts = SRC.match(/FACTS_CAP = ([0-9_]+)/);
  assert.ok(draft && facts);
  // The memo that triggered this was 9,232 chars with ~8k of facts.
  assert.ok(Number(draft[1].replace(/_/g, "")) >= 40000, "draft cap must clear a long memo by a wide margin");
  assert.ok(Number(facts[1].replace(/_/g, "")) >= 16000, "facts cap must clear a full facts_json");
});

test("a clip announces itself and forbids the truncation verdict it would otherwise cause", () => {
  assert.match(SRC, /CLIPPED HERE for length/);
  assert.match(SRC, /This cut is ours, not a defect in the work/);
  assert.match(SRC, /Do NOT report the draft as truncated or incomplete/);
});

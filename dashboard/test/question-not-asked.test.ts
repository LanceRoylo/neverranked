/* A question at 0% is two opposite findings, exactly like an engine at 0%.
 *
 *   asked, got nothing   -> a real absence the customer might act on
 *   not asked at all     -> an absence of MEASUREMENT, and nothing happened
 *
 * by_question already distinguished this for the PRIOR window (first_reading,
 * which stops "rose from 0%"). The current window had no mirror, so a question
 * switched off read as a collapse.
 *
 * 2026-09-24, hawaii-theatre: twelve questions "returned zero citations this
 * month" after citing 87, 86, 86, 84 and so on in August. Every one was
 * inactive -- they stopped being asked when the set reverted to the core 18.
 * The draft made verifying that loss the first punch-list item. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const INPUTS = fs.readFileSync(new URL("../src/lib/memo-inputs.ts", import.meta.url), "utf8");
const GEN = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");

test("a question with no runs this period is flagged, not scored as zero", () => {
  assert.match(INPUTS, /not_asked_this_period: true/);
  assert.match(INPUTS, /v\.cr > 0 \? \{\} : \{ not_asked_this_period: true \}/,
    "the flag must key off current runs, not the citation count");
});

test("the flag mirrors first_reading rather than replacing it", () => {
  // Both must survive: one guards the prior window, one the current.
  assert.match(INPUTS, /first_reading\?: boolean;/);
  assert.match(INPUTS, /not_asked_this_period\?: boolean;/);
  assert.match(INPUTS, /v\.pr > 0 \? \{\} : \{ first_reading: true \}/);
});

test("the prompt forbids describing an unmeasured question as a loss", () => {
  assert.match(GEN, /not_asked_this_period/);
  for (const verb of ["dropped", "lost citations", "went to zero", "crashed"]) {
    assert.ok(GEN.includes(verb), `the prompt must name "${verb}" as forbidden here`);
  }
});

test("the prompt forbids a punch-list item chasing a loss that did not happen", () => {
  assert.match(GEN, /never ask the customer to investigate a loss that did not happen/i);
});

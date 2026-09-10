import { test } from "node:test";
import assert from "node:assert/strict";
import { firstCausalClaim, noteCausalOk, CAUSAL_PATTERNS } from "../src/lib/causal-claims.ts";

/**
 * The published Atlas boundary refuses "causation claims of any kind", and
 * atlas-grader.ts enforced that mechanically. The monthly readout note, which
 * is the artifact a paying customer actually opens, had a line of prompt text
 * and nothing else.
 */
test("the causal claims a measurement practice must never make", () => {
  const forbidden = [
    "Your new landing page caused Perplexity to cite you.",
    "The schema work drove the increase.",
    "Publishing the FAQ led to three new citations.",
    "The gain resulted in a stronger position.",
    "Your share rose because of the content refresh.",
    "Citations fell due to the site migration.",
    "As a result of your updates, Gemini names you more often.",
    "Thanks to the new pages, you appear on two more tools.",
  ];
  for (const s of forbidden) {
    assert.equal(noteCausalOk(s), false, `should have been rejected: ${s}`);
  }
});

test("correlation stated plainly survives, because it is the allowed form", () => {
  const allowed = [
    "On the same day you published the page, Perplexity began citing you.",
    "Your share moved from 2 percent to 4 percent this month.",
    "Gemini grounded cites you on nine of eighteen questions.",
    "This is consistent with the work your team shipped in August.",
    "Two competitors appeared on questions where you did not.",
  ];
  for (const s of allowed) {
    assert.equal(noteCausalOk(s), true, `should have passed: ${s}`);
  }
});

test("the matched phrase is reported so the log says what tripped", () => {
  assert.equal(firstCausalClaim("The refresh drove your gain."), "drove");
  assert.equal(firstCausalClaim("Nothing causal here at all."), null);
});

test("empty and absent text make no claim", () => {
  assert.equal(firstCausalClaim(""), null);
  assert.equal(noteCausalOk(""), true);
});

test("every pattern is case-insensitive, since a note may start a sentence", () => {
  for (const re of CAUSAL_PATTERNS) {
    assert.equal(re.flags.includes("i"), true, `not case-insensitive: ${re}`);
  }
  assert.equal(noteCausalOk("Because of the update, you gained share."), false);
});

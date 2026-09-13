import { test } from "node:test";
import assert from "node:assert/strict";
import { firstRetiredClaim, firstRetiredClaimIn, RETIRED_CLAIMS } from "../src/lib/retired-claims";

/* The draft that was one click from publication.
 *
 * Real text, from weekly_briefs id 1, slug week-of-2026-06-22, status draft,
 * generated 2026-07-02 and still approvable on 2026-09-12. Its summary carries
 * the retired taxonomy and its body names Copilot. publishBrief() was a bare
 * UPDATE, so a single POST would have put both on a public page. */
const REAL_SUMMARY =
  "In the first week of tracking, four businesses ran 923 queries across seven AI engines and received zero citations. The data shows what happens before AI visibility exists.";

test("the summary that sat approvable for 71 days is refused", () => {
  const hit = firstRetiredClaim(REAL_SUMMARY);
  assert.ok(hit, "the real draft summary must not pass");
  assert.equal(hit.id, "retired-seven-tools");
  assert.equal(hit.match.toLowerCase(), "seven ai engines");
});

test("Copilot is refused in any casing", () => {
  for (const s of ["Microsoft Copilot cited them", "copilot returned nothing", "COPILOT"]) {
    assert.equal(firstRetiredClaim(s)?.id, "retired-copilot", s);
  }
});

test('"seven measured surfaces" stays legal, because it is true', () => {
  // Seven channels genuinely were queried. What is false is calling all seven
  // AI tools. If this ever starts failing, the pattern has over-reached.
  assert.equal(firstRetiredClaim("six AI tools plus a Bing organic control, seven measured surfaces"), null);
  assert.equal(firstRetiredClaim("across all seven measured surfaces"), null);
});

test("the retracted HTC numbers are refused in their known framings", () => {
  assert.equal(firstRetiredClaim("the score went 45 to 95 in ten days")?.id, "retracted-htc-score");
  assert.equal(firstRetiredClaim("cited on 14 of 19 questions")?.id, "retracted-htc-perplexity");
  assert.equal(firstRetiredClaim("moved from 5 to 14")?.id, "retracted-htc-perplexity");
});

test("the refusal names the field, because 'somewhere in this brief' is not a fix", () => {
  const hit = firstRetiredClaimIn({
    title: "A clean title",
    summary: "nothing wrong here",
    body_markdown: "and then Copilot said",
  });
  assert.equal(hit?.field, "body_markdown");
  assert.equal(hit?.id, "retired-copilot");
});

test("clean copy passes, and empty input is not a match", () => {
  assert.equal(firstRetiredClaim("Perplexity cited the hotel's own site 6% of the time"), null);
  assert.equal(firstRetiredClaim(""), null);
  assert.equal(firstRetiredClaim(null), null);
  assert.equal(firstRetiredClaim(undefined), null);
});

test("every entry carries a why a human can act on", () => {
  // A refusal with no remedy gets clicked again.
  for (const c of RETIRED_CLAIMS) {
    assert.ok(c.why.length > 40, `${c.id} needs a usable explanation`);
    assert.ok(c.id && c.re instanceof RegExp);
  }
});

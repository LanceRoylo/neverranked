import { test } from "node:test";
import assert from "node:assert/strict";
import { assessEngineCoverage } from "../src/lib/report-facts";

/* Under-collection vs quietness.
 *
 * Every fixture below is the REAL shape of a measured client month, taken from
 * production rather than invented. The slug and month are not named: this repo
 * is public and per-client figures belong in the private docs repo.
 *
 *     engine               distinct Qs   observations   refusals
 *     perplexity                 30/30            384          0
 *     google_ai_overview         27/30            162          0
 *     openai                     30/30            158        493
 *
 * OpenAI and AIO are one percentage point apart on density and mean opposite
 * things. Only engine_failures separates them. */

/** n rows for `engine`, cycling through `q` distinct keywords. */
function rows(engine: string, q: number, n: number): Array<{ engine: string; keyword: string }> {
  return Array.from({ length: n }, (_, i) => ({ engine, keyword: `q${i % q}` }));
}

const SEPTEMBER = [
  ...rows("perplexity", 30, 384),
  ...rows("google_ai_overview", 27, 162),
  ...rows("openai", 30, 158),
];
const FAILURES = new Map([["openai", 493]]);

const find = (cov: ReturnType<typeof assessEngineCoverage>, e: string) => {
  const c = cov.find((x) => x.engine === e);
  assert.ok(c, `${e} missing from assessment`);
  return c;
};

test("openai answered every question and is still excluded, because refusals explain the gap", () => {
  const openai = find(assessEngineCoverage(SEPTEMBER, FAILURES), "openai");
  // The old measure passed it at 100%: it DID answer all 30 questions.
  assert.equal(openai.questionsCovered, 30);
  assert.equal(openai.pct, 1);
  // The new measure sees 41% of the observations a healthy surface collected.
  assert.equal(openai.observations, 158);
  assert.equal(openai.observationsExpected, 384);
  assert.ok(openai.density < 0.5, `density was ${openai.density}`);
  assert.equal(openai.underCollected, true);
  assert.equal(openai.sufficient, false);
});

test("AI Overviews sits at the same density with no refusals and stays in the report", () => {
  const aio = find(assessEngineCoverage(SEPTEMBER, FAILURES), "google_ai_overview");
  assert.ok(aio.density < 0.5, `density was ${aio.density}`);
  // Same shortfall as openai, opposite verdict: nothing refused it, it simply
  // declines to render. Excluding it for that would be the wrong call.
  assert.equal(aio.underCollected, false);
  assert.equal(aio.sufficient, true);
});

test("a healthy surface is untouched", () => {
  const pplx = find(assessEngineCoverage(SEPTEMBER, FAILURES), "perplexity");
  assert.equal(pplx.density, 1);
  assert.equal(pplx.underCollected, false);
  assert.equal(pplx.sufficient, true);
});

test("with no failure data the under-collection test is skipped, not guessed", () => {
  // Pre-guard behaviour. A missing telemetry table must degrade the guard,
  // never erase a report by excluding everything.
  const openai = find(assessEngineCoverage(SEPTEMBER), "openai");
  assert.equal(openai.underCollected, false);
  assert.equal(openai.sufficient, true);
});

test("one transient refusal cannot condemn a surface just under the line", () => {
  const openai = find(assessEngineCoverage(SEPTEMBER, new Map([["openai", 3]])), "openai");
  assert.equal(openai.underCollected, false);
  assert.equal(openai.sufficient, true);
});

test("refusals alone do not exclude a surface that still collected fully", () => {
  // openai was refused 493 times in September AND recovered: on a window where
  // it kept pace, the refusals are history, not a reason to drop it.
  const healthy = [...rows("perplexity", 30, 384), ...rows("openai", 30, 380)];
  const openai = find(assessEngineCoverage(healthy, FAILURES), "openai");
  assert.ok(openai.density > 0.5);
  assert.equal(openai.underCollected, false);
  assert.equal(openai.sufficient, true);
});

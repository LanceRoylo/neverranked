/* An engine at 0% is TWO different findings, and the memo must never guess
 * which one it is looking at.
 *
 *   cohort_citations > 0  ->  the engine named other businesses and not the
 *                             customer. A finding ABOUT the customer, often
 *                             the most important one in the memo.
 *   cohort_citations == 0 ->  the engine named nobody in the category. An
 *                             engine-level absence the customer cannot fix.
 *
 * 2026-09: Prince's first paid memo carried the sentence "Claude carried 409
 * runs this period but named no business in the category at all, neither
 * Prince nor any competitor. That is an engine-level absence, not a
 * Prince-specific gap." Claude had named 405 cohort businesses and Prince
 * zero times. It was the sharpest customer-specific gap in the dataset and
 * the memo told the customer it was not their problem.
 *
 * The measurement was never wrong. The run-based path simply carried no
 * per-engine cohort count, so a 0% share was the ONLY thing the writer could
 * see, and it filled in the reason. These tests keep the evidence attached. */
import { test } from "node:test";
import assert from "node:assert/strict";

type Engine = { engine: string; current_runs: number; cohort_citations?: number; no_cohort_signal?: boolean };

/** The rule the generator prompt encodes, executable. */
function mayClaimEngineNamedNobody(e: Engine): boolean {
  return e.no_cohort_signal === true;
}

/** Mirrors the run-based path: assert absence only against a real cohort. */
function darkFromRuns(cohortSize: number, cohort: number, runs: number): boolean {
  return cohortSize > 0 && cohort === 0 && runs > 0;
}

test("an engine that named competitors but not the customer is never excusable", () => {
  const claude: Engine = { engine: "Claude", current_runs: 635, cohort_citations: 405 };
  assert.equal(claude.no_cohort_signal, undefined);
  assert.equal(mayClaimEngineNamedNobody(claude), false);
});

test("a control that genuinely named nobody still gets the absence flag", () => {
  const bing: Engine = { engine: "Bing search (control)", current_runs: 771, cohort_citations: 0, no_cohort_signal: true };
  assert.equal(mayClaimEngineNamedNobody(bing), true);
});

test("0% share alone never licenses the claim", () => {
  const unknown: Engine = { engine: "Some engine", current_runs: 500 };
  assert.equal(mayClaimEngineNamedNobody(unknown), false);
});

test("an empty competitor roster must not read as every engine naming nobody", () => {
  assert.equal(darkFromRuns(0, 0, 900), false);
  assert.equal(darkFromRuns(12, 0, 900), true);
});

test("an engine with no runs is silent, not absent", () => {
  assert.equal(darkFromRuns(12, 0, 0), false);
});

test("the prompt still carries both halves of the rule", async () => {
  const fs = await import("node:fs/promises");
  const src = await fs.readFile(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  assert.match(src, /no_cohort_signal/, "the flag must be named in the prompt");
  assert.match(src, /cohort_citations/, "the counter-evidence must be named in the prompt");
  assert.match(src, /Never infer an engine-level absence from a 0% share alone/,
    "the prohibition that stops the 2026-09 sentence must stay in the prompt");
});

test("the number gate accepts the cohort count the memo is required to cite", async () => {
  const fs = await import("node:fs/promises");
  const src = await fs.readFile(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  // Shipped 2026-09-23 without this: the memo correctly wrote "405" and the
  // figure gate flagged it as unverified, because the allowlist was not
  // updated alongside the field. A gate that flags correct numbers is a gate
  // people learn to wave through.
  assert.match(src, /add\(e\.cohort_citations\)/,
    "cohort_citations must be registered with the figure allowlist");
});

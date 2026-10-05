/* 2026-10-05. A delivered memo told a paying client that Google AI Overviews
 * "returned 0% this period across 3226 runs" and "named 157 businesses in the
 * category and did not name" the client. AI Overviews named the client in 28 to 41% of
 * its answers. The 0% was the share of CITED LINKS pointing to the client's own
 * site (16 of 3,226), 3,226 was links not runs (it ran 312 times), and 157 was
 * links to hotel sites, not businesses named. The writer was handed a number
 * with no label and a rule that read every 0% as "named others, not you". */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allowedNumberSet } from "../src/lib/memo-generator";
import { engineKeyForLabel, READOUT_ENGINE_LABEL } from "../src/lib/readout-engine-labels";
import type { MemoInputs } from "../src/lib/memo-inputs";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("every snapshot label maps back to its engine key", () => {
  for (const [key, label] of Object.entries(READOUT_ENGINE_LABEL)) assert.equal(engineKeyForLabel(label), key);
  assert.equal(engineKeyForLabel("Microsoft Copilot"), null);
});

test("there is one engine label map, not two", () => {
  assert.doesNotMatch(read("../src/citations.ts"), /const READOUT_ENGINE_LABEL: Record<string, string> = \{/);
  assert.match(read("../src/citations.ts"), /import \{ READOUT_ENGINE_LABEL \} from "\.\/lib\/readout-engine-labels"/);
});

test("citation-layer snapshot rows say what their percentage measures", () => {
  const src = read("../src/lib/memo-inputs.ts");
  assert.match(src, /measure: "own_site_link_share" as const/);
  assert.match(src, /answers_citing_customer_pct: rb\.current_share_pct/);
  assert.match(src, /current_runs: rb \? rb\.current_runs :/, "runs come from the rows, not the link total");
});

test("the writer may not read an own-site link share as naming", () => {
  const prompt = read("../src/lib/memo-generator.ts");
  assert.match(prompt, /READ "measure" ON EVERY ENGINE ROW/);
  assert.match(prompt, /It says NOTHING about whether the engine names the customer/);
  assert.match(prompt, /cited_links is a count of links, never of runs/);
  assert.doesNotMatch(prompt, /The CONVERSE is a hard rule and the more common case: a 0% share WITHOUT "no_cohort_signal" means that engine named OTHER businesses/);
});

test("the figures the writer is told to use verify against the number guard", () => {
  const inp = {
    by_engine: [{
      engine: "Google AI Overviews", current_share_pct: 0, prior_share_pct: 0, delta_pp: 0,
      current_runs: 312, cohort_citations: 157, layer: "citation",
      measure: "own_site_link_share", cited_links: 3226, answers_citing_customer_pct: 34,
    }],
    overall: { current: { runs: 0, cited: 0, share_pct: 0 }, prior: { runs: 0, cited: 0, share_pct: 0 }, share_delta_pp: 0 },
    cohort: { rank: null, members: [], customer_mentions: 0 },
    by_category: [],
    by_question: [], offsite: { source_types: [], hosts: [] },
  } as unknown as MemoInputs;
  const allowed = allowedNumberSet(inp);
  for (const n of ["312", "3226", "34"]) assert.ok(allowed.has(n), `${n} must verify`);
});

/* The stable-core comparison, decided 2026-10-01 for the first paid
 * month-over-month memo (the paying client, October, generates 10-24). */
test("the memo compares on the stable core, and only there", () => {
  const src = read("../src/lib/memo-inputs.ts");
  assert.match(src, /basis: "stable_core"/);
  assert.match(src, /loadStableCoreCounts\(env, slug, prev, cur\)/);
  assert.match(src, /loadInstrumentEvents\(env, prev, cur, slug\)/);
  // Two bases in one memo is how a correct number lands in a false sentence.
  assert.match(src, /\.\.\.\(comparison \? \{ comparison \} : like_for_like \? \{ like_for_like \} : \{\}\)/);
  // This object reaches the client: no internal event notes.
  assert.match(src, /instrument_changes: c\.events\.map\(publicEventLine\)/);
  assert.match(src, /statement: publicReason\(describeMovement/);
});

test("comparison figures verify, and the writer is bound to them", () => {
  const inp = {
    overall: { current: { runs: 0, cited: 0, share_pct: 0 }, prior: { runs: 0, cited: 0, share_pct: 0 }, share_delta_pp: 0 },
    cohort: { rank: null, members: [], customer_mentions: 0 }, by_category: [],
    by_engine: [], by_question: [], offsite: { source_types: [], hosts: [] },
    comparison: {
      basis: "the 18 questions measured on every day of both months", questions: 18, questions_excluded: 12,
      per_surface: [{ engine: "Perplexity", layer: "citation", stated: true, statement: "x", prior_pct: 21.3, current_pct: 24.8, delta_pp: 3.5 }],
      pooled: { citation: "x", model_knowledge: "y" }, instrument_changes: [], considered_and_set_aside: [],
    },
  } as unknown as MemoInputs;
  const allowed = allowedNumberSet(inp);
  for (const n of ["18", "12", "21.3", "24.8", "3.5"]) assert.ok(allowed.has(n), `${n} must verify`);
  const prompt = read("../src/lib/memo-generator.ts");
  assert.match(prompt, /WHEN data\.comparison IS PRESENT IT IS THE ONLY SOURCE OF ANY MONTH-OVER-MONTH CLAIM/);
  assert.match(prompt, /Whether answers NAME the customer is NOT compared month over month yet/);
  assert.match(prompt, /NEVER GENERALISE ABOUT WHAT COMPETITORS/);
});

test("the cross-map note carries no semicolon", () => {
  assert.doesNotMatch(read("../src/lib/readiness-crossmap.ts"), /This is what we check;/);
});

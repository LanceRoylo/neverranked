/* 2026-11-05: the checks that would have caught the October drafts. Each case
 * is the shape a real draft took, on a fictional business: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  checkComparedQuestionCount, checkHeadingCounts, checkPlainWords, checkShortVersion,
  checkUnbasedMovement, memoDraftIssues, writerView,
} from "../src/lib/memo-draft-check";
import { splitShortVersion } from "../src/routes/customer-readouts";
import type { MemoInputs } from "../src/lib/memo-inputs";

const comparison = {
  basis: "the 18 questions measured on every day of both months",
  questions: 18,
  questions_excluded: 12,
  per_surface: [
    { engine: "Gemini", layer: "citation", stated: true, statement: "", prior_pct: 24.4, current_pct: 20.1, delta_pp: -4.3 },
    { engine: "ChatGPT search", layer: "citation", stated: false, statement: "no movement can be stated" },
  ],
  pooled: { citation: "Surfaces that search the web went from 19.0% to 14.2%.", model_knowledge: "no movement can be stated" },
  instrument_changes: [],
} as unknown as MemoInputs["comparison"];
const by_question = [{ keyword: "q", category: "client", current_pct: 45, prior_pct: 21, delta_pp: 24 }] as unknown as MemoInputs["by_question"];
const inp = { comparison, by_question };

test("an overall figure the comparison never stated is flagged, however it is worded", () => {
  assert.equal(checkUnbasedMovement("Your share was 8%, down from 10%.", inp).length, 1);
  assert.equal(checkUnbasedMovement("That is 8% of links this period, down from 10% last month.", inp).length, 1);
  assert.equal(checkUnbasedMovement("Overall it went from 69% to 72%.", inp).length, 1);
});

test("a change the comparison states passes, as does one on a single question", () => {
  assert.deepEqual(checkUnbasedMovement("Gemini went from 24.4% to 20.1%.", inp), []);
  assert.deepEqual(checkUnbasedMovement("Gemini fell from 24% to 20%.", inp), [], "rounded for the reader");
  assert.deepEqual(checkUnbasedMovement("Pooled, it went from 19.0% to 14.2%.", inp), []);
  assert.deepEqual(checkUnbasedMovement("On that question it went from 21% to 45%.", inp), []);
});

test("with no comparison there is nothing to hold movement to", () => {
  assert.deepEqual(checkUnbasedMovement("It went from 69% to 72%.", { comparison: undefined, by_question }), []);
});

test("a count of compared questions must be the comparison's", () => {
  assert.equal(checkComparedQuestionCount("Across the seven questions measured on every day of both months.", inp).length, 1);
  assert.deepEqual(checkComparedQuestionCount("Across the 18 questions we asked on every day of both months.", inp), []);
});

test("a heading that counts questions must match the list under it", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => `- q${i}`).join("\n");
  assert.equal(checkHeadingCounts(`### The 18 questions\n\n${list(22)}\n`).length, 1);
  assert.deepEqual(checkHeadingCounts(`### The 18 questions\n\n${list(18)}\n`), []);
  assert.deepEqual(checkHeadingCounts("### The 18 questions\n\nProse, and nothing to count.\n"), []);
});

test("our words are flagged and the everyday senses are not", () => {
  for (const s of ["the stable core", "citation share", "each surface", "the four surfaces", "your cohort", "an instrument change", "the noise band", "down 4 pp", "Gemini grounded"]) {
    assert.equal(checkPlainWords(s).length, 1, s);
  }
  for (const s of ["the tool surfaces the page", "the pool surface", "a snap decision", "instrumental"]) {
    assert.deepEqual(checkPlainWords(s), [], s);
  }
});

test("a draft with no short version is flagged", () => {
  assert.equal(checkShortVersion("## November 2026: what moved\n\nBody.").length, 1);
  assert.deepEqual(checkShortVersion("## November 2026\n\n### This month in plain words\n\nThree paragraphs."), []);
});

test("the short version comes out of the body, and the rest stays in order", () => {
  const md = "## November 2026\n\n### This month in plain words\n\nOne.\n\nTwo.\n\n### Where you stand\n\nThird.\n";
  const { note, rest } = splitShortVersion(md);
  assert.equal(note, "One.\n\nTwo.");
  assert.doesNotMatch(rest, /plain words|One\./);
  assert.match(rest, /^## November 2026[\s\S]*### Where you stand\n\nThird\./);
});

test("a memo delivered before the short version existed renders whole", () => {
  const md = "## September 2026\n\n### Where you stand\n\nBody.";
  assert.deepEqual(splitShortVersion(md), { note: null, rest: md });
});

test("the writer never sees a month-over-month figure the comparison did not state", () => {
  const full = {
    comparison, by_question,
    overall: { current: { runs: 9, cited: 1, share_pct: 8 }, prior: { runs: 0, cited: 0, share_pct: 10 }, share_delta_pp: -2 },
    by_engine: [{ engine: "Gemini", current_share_pct: 20, prior_share_pct: 25, delta_pp: -5 }],
    like_for_like: { questions: 18, current_share_pct: 14, prior_share_pct: 19, share_delta_pp: -5, questions_added_since_prior: 12, basis: "b" },
  } as unknown as MemoInputs;
  const v = writerView(full) as Record<string, any>;
  assert.deepEqual(Object.keys(v.overall), ["current"]);
  assert.equal(v.by_engine[0].prior_share_pct, undefined);
  assert.equal(v.by_engine[0].delta_pp, undefined);
  assert.equal(v.like_for_like.prior_share_pct, undefined);
  assert.equal(v.like_for_like.questions_added_since_prior, 12, "the set growing is still said");
  assert.equal(v.comparison, comparison);
});

test("with no comparison the writer gets the inputs as they were", () => {
  const full = { comparison: undefined, overall: {} } as unknown as MemoInputs;
  assert.equal(writerView(full), full);
});

test("the delivery gate and the generator both run these checks", () => {
  const src = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
  assert.match(src, /\.\.\.memoDraftIssues\(body, inputs\)/, "vetMemoBody blocks delivery on them");
  assert.match(src, /data: writerView\(inputs\)/);
  assert.ok(memoDraftIssues("### This month in plain words\n\nFine.", inp).length === 0);
});

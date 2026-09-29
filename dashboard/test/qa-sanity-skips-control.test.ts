/* The QA sanity sweep must not grade the control on whether it answered.
 *
 * Measured 2026-09-29: all 15 red citation_sanity verdicts in the prior week
 * were engine='bing'. Zero were an AI surface. The reasons were "provides game
 * links" and "does not address the query about hotels in Hawaii" — which is the
 * published Fact Bank finding about keyword search failing at questions, not a
 * defect. Bing RETURNS RESULTS. It does not answer.
 *
 * The damage was not the wasted grader calls. "13 QA red verdict(s) this week"
 * is what turned the weekly summary yellow, so the system health colour was
 * being set by the control behaving exactly as designed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isControlEngine } from "../src/lib/engine-layer";

const SRC = fs.readFileSync(new URL("../src/lib/qa-citation-sanity.ts", import.meta.url), "utf8");

test("the sweep filters the control out before spending a grader call", () => {
  assert.match(SRC, /const gradable = rows\.filter\(\(r\) => !isControlEngine\(r\.engine\)\)/);
  assert.match(SRC, /for \(const r of gradable\)/, "the loop must iterate the filtered set");
  assert.doesNotMatch(SRC, /for \(const r of rows\)/, "the unfiltered loop must be gone");
});

test("the single-run auditor refuses the control too", () => {
  // Guarded in both places: the sweep is the current caller, the auditor is
  // what a manual trigger or a future caller reaches.
  assert.match(SRC, /if \(row && isControlEngine\(row\.engine\)\) \{/);
  assert.match(SRC, /return null;/);
});

test("which surface is the control is not restated here", () => {
  // engine-layer.ts is the one place that knows. A second private copy is the
  // bug this codebase keeps rediscovering.
  const code = SRC.split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(code, /["']bing["']/, "no hardcoded control name in executable code");
  assert.match(SRC, /import \{ isControlEngine \} from "\.\/engine-layer"/);
});

test("the skip is reported rather than silent", () => {
  // A sweep that quietly audits fewer rows looks identical to one that is
  // broken. Say what was skipped and why.
  assert.match(SRC, /skipped \$\{skipped\} control run\(s\)/);
  assert.match(SRC, /returns results, it does not answer/);
});

test("the canonical resolver still recognises the control by key and by label", () => {
  // Anchors the dependency this fix now rests on.
  assert.equal(isControlEngine("bing"), true);
  assert.equal(isControlEngine("Bing search (control)"), true);
  assert.equal(isControlEngine("perplexity"), false);
  assert.equal(isControlEngine("google_ai_overview"), false);
  assert.equal(isControlEngine("anthropic"), false);
});

/* An absence and a value are different facts.
 *
 * Six times in three days a missing thing was given a number and the number
 * was reported to someone as if it were measured:
 *
 *   layer absent            -> treated as citation-grade, so Claude and Gemma
 *                              appeared in a chart about what a tool reads
 *   prior missing           -> fell back to the CURRENT share, so a month with
 *                              nothing to compare read as "held flat"
 *   question not asked      -> read as zero citations, so twelve questions we
 *                              switched off looked like a collapse
 *   cadence uncounted       -> measurement_days 0, and the prompt REQUIRES the
 *                              memo to state cadence from that field
 *   venue share uncomputed  -> "ranked 3 of 35 venues at 0% citation share" on
 *                              a paying customer's dashboard
 *   the same, in memo-inputs-> the memo's headline share set to 0%
 *
 * This test exists so the seventh is caught by a machine instead of by
 * reading. It does not ban `?? 0`. Most uses are accumulators where zero is
 * genuinely correct:
 *
 *   map.get(key) ?? 0        counting up from nothing IS zero
 *   set.size ?? 0            an empty set HAS zero members
 *
 * What it catches is `?? 0` or `|| 0` applied to a field read out of STORED
 * DATA -- a parsed snapshot, a DB row -- where the field being missing means
 * "we did not compute this", not "this is zero".
 *
 * To add one deliberately, put `absent-is-zero:` and a reason on the line
 * above. That is the whole point: the decision gets made rather than typed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** Files whose numbers reach a customer, in a memo or on a page. */
const CUSTOMER_FACING = [
  "../src/lib/memo-inputs.ts",
  "../src/lib/report-facts.ts",
  "../src/routes/customer-view.ts",
  "../src/routes/customer-readouts.ts",
  // Added 2026-09-26 after Atlas was found substituting a 7.3x smaller share
  // for the headline one whenever the headline could not be computed. The
  // chat is a customer-facing surface like any other.
  "../src/lib/atlas-context.ts",
];

/** Reading from a local accumulator: zero is the right answer. */
const ACCUMULATOR = /\.(get|size|length)\b[^?|]*$|\.(get\([^)]*\)|size|length)\s*(\?\?|\|\|)\s*0/;

/** Reading a named field off an object: absence may mean "not computed". */
const STORED_FIELD = /(\w+(?:\?)?\.\w+|\w+\[[^\]]+\])\s*(\?\?|\|\|)\s*0\b/;

function offenders(file: string): string[] {
  const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const lines = src.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/(\?\?|\|\|)\s*0\b/.test(line)) continue;
    if (/^\s*(\/\/|\*)/.test(line)) continue;              // a comment quoting the shape
    if (ACCUMULATOR.test(line)) continue;                   // counting up from nothing
    if (!STORED_FIELD.test(line)) continue;                 // not a stored-field read
    const above = lines.slice(Math.max(0, i - 3), i).join("\n");
    if (/absent-is-zero:/.test(above) || /absent-is-zero:/.test(line)) continue;
    out.push(`${file.replace("../", "")}:${i + 1}  ${line.trim().slice(0, 96)}`);
  }
  return out;
}

test("no unjustified absent-is-zero on a path that reaches a customer", () => {
  const found = CUSTOMER_FACING.flatMap(offenders);
  assert.deepEqual(found, [],
    "Each line below gives a missing stored field the value 0, on a path whose\n" +
    "numbers reach a customer. Either preserve the absence, or mark the line\n" +
    "with `absent-is-zero: <why zero is the honest answer here>`.\n\n" +
    found.join("\n"));
});

test("the rule recognises accumulators and does not fire on them", () => {
  // Guards the guard: if ACCUMULATOR stopped matching, every counter in these
  // files would be reported and the test would be abandoned within a week.
  const src = fs.readFileSync(new URL("../src/lib/memo-inputs.ts", import.meta.url), "utf8");
  const counters = src.split("\n").filter((l) => /\.get\([^)]*\)\s*\?\?\s*0/.test(l));
  assert.ok(counters.length > 0, "memo-inputs should contain Map.get accumulators");
  for (const line of counters) assert.match(line, ACCUMULATOR, `should be treated as an accumulator: ${line.trim()}`);
});

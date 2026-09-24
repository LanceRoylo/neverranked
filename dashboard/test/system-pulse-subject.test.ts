/* The admin header must report the thing the product actually does daily.
 *
 * It read scan_results -- the AEO domain scanner, a weekly subsystem -- under
 * the bare label "Last scan". Beside "Monitoring 4 clients" and "Daily cycle
 * in 8h", "Last scan 3d ago" reads as "measurement is three days stale". On
 * 2026-09-24 it said that while the citation sweep had run that morning and
 * written rows for every client. True about scans, false about the machine,
 * and on the screen that gets opened most. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/system-pulse.ts", import.meta.url), "utf8");

test("the pulse leads with citation runs, not domain scans", () => {
  // Compare the CODE, not the comment block above it.
  const code = SRC.slice(SRC.indexOf("const done ="));
  const runsAt = code.indexOf("citation run");
  const scansAt = code.indexOf("domain scan");
  assert.ok(runsAt > 0, "citation runs must be reported");
  assert.ok(scansAt > 0, "domain scans may still appear as a fallback");
  assert.ok(runsAt < scansAt, "citation runs must come first in the fallback chain");
});

test("the domain scanner is never labelled with a bare 'Last scan'", () => {
  assert.doesNotMatch(SRC, /`Last scan \$\{/,
    "a bare 'Last scan' beside 'Daily cycle' reads as the sweep being stale");
  assert.match(SRC, /Last domain scan/, "the scanner must be named for what it is");
});

test("a failed pulse query degrades instead of breaking the header", () => {
  const i = SRC.indexOf("FROM citation_runs WHERE run_at");
  assert.ok(i > 0);
  assert.match(SRC.slice(i, i + 400), /catch\(\(\) => null\)/,
    "the header must survive a query failure");
});

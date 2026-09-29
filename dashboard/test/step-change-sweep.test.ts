/* The step detector's write layer.
 *
 * step-change.ts is pure arithmetic and is tested in step-change.test.ts. What
 * matters here is what reaches the database, because instrument_events is the
 * ONLY thing comparePeriods() reads when deciding whether a comparison may be
 * stated. A detector that only emailed somebody would leave the comparison
 * layer exactly as blind as it was on 2026-08-23.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RESUPPRESS_DAYS } from "../src/lib/step-change-sweep";
import { WINDOW_DAYS } from "../src/lib/step-change";

const SRC = fs.readFileSync(new URL("../src/lib/step-change-sweep.ts", import.meta.url), "utf8");
const CRON = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");

test("it records a row, not just an alert", () => {
  assert.match(SRC, /INSERT OR IGNORE INTO instrument_events/);
  assert.match(SRC, /'detector'/, "rows must be attributable to the detector");
});

test("it never asserts a cause", () => {
  // The detector sees a step in a number. Naming the adapter would be the same
  // failure the comparison layer exists to prevent, one level up.
  assert.match(SRC, /'unexplained_step'/);
  assert.doesNotMatch(
    SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""),
    /'engine_adapter_changed'/,
    "the detector may not classify the cause it cannot see",
  );
});

test("windows are scoped to questions measured in both", () => {
  // Without this a question-set change reads as an engine step, and we would
  // be detecting one confound with another.
  assert.match(SRC, /INTERSECT/);
  assert.match(SRC, /keyword_id IN \(SELECT keyword_id FROM both\)/);
});

test("it groups per client AND per engine, never pooled", () => {
  // Pooled across clients, Perplexity moved 34.75% to 33.19% across its own
  // migration, because one client's fall was cancelled by another rising.
  assert.match(SRC, /GROUP BY k\.client_slug, cr\.engine/);
});

test("a detected step suppresses itself for longer than the window", () => {
  // A real step keeps showing until the older window rolls past it, which
  // takes WINDOW_DAYS. Suppression must outlast that or a daily sweep writes a
  // near-identical row every morning for two weeks.
  assert.ok(RESUPPRESS_DAYS > WINDOW_DAYS, `${RESUPPRESS_DAYS} must exceed ${WINDOW_DAYS}`);
  assert.equal(RESUPPRESS_DAYS, 28);
  assert.match(SRC, /kind = 'unexplained_step'[\s\S]*?AND engine = \?[\s\S]*?AND client_slug = \?/);
});

test("a suppressed or duplicate finding is counted, not silently dropped", () => {
  // A sweep that quietly writes less looks identical to one that is broken.
  assert.match(SRC, /suppressed\+\+/);
  assert.match(SRC, /out\.found\+\+/);
  assert.match(SRC, /checked: rows\.length/);
});

test("the inbox notice is a courtesy and cannot fail the sweep", () => {
  assert.match(SRC, /catch \(e\) \{[\s\S]*?inbox notify failed/);
  assert.match(SRC, /reclassify the row/, "a human is told how to correct the record");
});

test("it runs on the daily cron and logs a real status", () => {
  assert.match(CRON, /sweepStepChanges/);
  assert.match(CRON, /"instrument_step_sweep"/);
  assert.match(CRON, /checked=\$\{r\.checked\} found=\$\{r\.found\} written=\$\{r\.written\}/);
  // "error" is not a CronRunStatus; using it typechecks green only by accident.
  assert.doesNotMatch(CRON, /"instrument_step_sweep", "error"/);
  assert.match(CRON, /"instrument_step_sweep", "failure"/);
});

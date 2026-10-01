/* daily_maintenance died on the 1st of August, September and October 2026 and
 * left no cron_runs row, not even a failure. Every day-2 run succeeded, so the
 * killer was day-1-only work: the NVI runner, which performs a full citation
 * run inside the 06:00 invocation that already carries the nightly sweep.
 *
 * Nothing noticed, because the only watch on daily_maintenance alerts at 2x
 * cadence (48h) and the next morning's success always arrived first.
 *
 * These tests hold both halves: the month-start work stays OUT of the 06:00
 * invocation, and a single missed day raises an alert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  missedTodaysRun,
  MUST_RUN_DAILY,
  CRON_EXPECTED_CADENCE,
  DAILY_RUN_GRACE_SEC,
} from "../src/lib/anomaly-detection";

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const CRON = read("../src/cron.ts");
const INDEX = read("../src/index.ts");
const WRANGLER = read("../wrangler.jsonc");

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function body(src: string, signature: string): string {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const next = src.indexOf("\nexport async function ", start + signature.length);
  return src.slice(start, next < 0 ? undefined : next);
}

test("the month-start work is not in the 06:00 invocation", () => {
  const maint = body(CRON, "export async function runDailyMaintenance(");
  // Comments may mention the move; only a call would put the work back.
  const code = maint.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /runMonthlyNviReport/);
  assert.doesNotMatch(code, /maybeSendMonthlyRecaps\(/);
  assert.doesNotMatch(code, /maybeSendAnnualRecaps\(/);
  assert.doesNotMatch(code, /runMonthStartWork\(/);
});

test("it runs on its own trigger, not on a waitUntil inside 06:00", () => {
  // A second waitUntil in the same scheduled event shares that event's
  // budget, which is the thing that ran out. Only a separate trigger helps.
  assert.match(WRANGLER, /"45 6 \* \* \*"/);
  const crons = WRANGLER.match(/"crons":\s*\[([^\]]*)\]/);
  assert.ok(crons);
  assert.ok(crons[1].split(",").length <= 5, "Cloudflare allows at most five cron triggers");
  assert.match(INDEX, /cron === "45 6 \* \* \*"[\s\S]{0,800}withCronLogging\(env, "month_start"[\s\S]{0,200}runMonthStartWork/);
});

test("the NVI runner stays held until its report is audited", () => {
  assert.match(CRON, /export const NVI_MONTHLY_PAUSED = true;/);
});

test("a single missed day is detected, which the 2x-cadence check cannot do", () => {
  // Oct 1: last row was Sep 30 06:03. At 06:30 that is 24.5h, nowhere near 48h.
  const lastRow = at("2026-09-30T06:03:51Z");
  const check = at("2026-10-01T06:30:00Z");
  assert.ok(check - lastRow < 2 * CRON_EXPECTED_CADENCE.daily_maintenance, "the cadence check would stay silent");
  assert.deepEqual(missedTodaysRun(check, lastRow), { missed: true, day: "2026-10-01" });
});

test("a run that logged this morning is not missed", () => {
  assert.deepEqual(
    missedTodaysRun(at("2026-09-30T06:30:00Z"), at("2026-09-30T06:03:51Z")),
    { missed: false, day: "2026-09-30" },
  );
});

test("a task that has never logged anything is missed", () => {
  assert.equal(missedTodaysRun(at("2026-10-01T07:00:00Z"), null)?.missed, true);
});

test("no verdict while the 06:00 run may still be in flight", () => {
  // The longest observed daily_tasks run is 449s. Judging before the grace
  // window closes would raise a false alarm on a slow morning.
  const tooEarly = at("2026-10-01T06:00:00Z") + DAILY_RUN_GRACE_SEC - 1;
  assert.equal(missedTodaysRun(tooEarly, at("2026-09-30T06:03:51Z")), null);
  assert.equal(missedTodaysRun(at("2026-10-01T03:00:00Z"), null), null);
  assert.ok(DAILY_RUN_GRACE_SEC > 449, "grace must exceed the slowest observed run");
});

test("both halves of the 06:00 split are checked per day", () => {
  assert.deepEqual([...MUST_RUN_DAILY].sort(), ["daily_maintenance", "daily_tasks"]);
});

test("every status surface knows daily_maintenance and month_start exist", () => {
  // Four private copies of the cadence table existed and only one listed
  // daily_maintenance. A surface that omits a task reports health it cannot see.
  for (const p of ["../src/routes/hub.ts", "../src/routes/health.ts", "../src/lib/weekly-summary-email.ts"]) {
    const src = read(p);
    assert.match(src, /\bdaily_maintenance:/, `${p} omits daily_maintenance`);
    assert.match(src, /\bmonth_start:/, `${p} omits month_start`);
  }
  assert.ok("daily_maintenance" in CRON_EXPECTED_CADENCE);
  assert.ok("month_start" in CRON_EXPECTED_CADENCE);
});

test("a missed-day alert does not auto-close", () => {
  // It records a fact about that day. The next morning's success does not
  // undo it, so it must not share the auto-closing overdue type.
  const AUTOCLOSE = read("../src/lib/alert-autoclose.ts");
  assert.doesNotMatch(AUTOCLOSE, /anomaly_cron_missed/);
});

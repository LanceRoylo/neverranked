/* The memo watchdog asks whether a memo was WRITTEN this month.
 *
 * It read created_at, which the generator's upsert deliberately preserves so a
 * memo regenerated ten times keeps the timestamp of its first insert. On
 * 2026-09-26 it alerted "Monthly memo not drafted for hawaii-theatre (latest
 * 2026-08-24)" about a memo that exists, is for the current month, and had
 * been regenerated the previous evening: row created 2026-08-24, written
 * 2026-09-25. The guard could only see the first of those.
 *
 * Second false alarm from a standing daily guard in two days, after the
 * dark-keyword watchdog judging a sweep still in flight. A guard that cries
 * wolf gets skimmed, and skimming it is how the real one is missed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CRON = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
const block = CRON.slice(CRON.indexOf("Memo-drafts watchdog"), CRON.indexOf("Alert age-out"));

test("the watchdog reads when a memo was written, not when its row appeared", () => {
  assert.match(block, /MAX\(updated_at\) AS written/);
  assert.doesNotMatch(block, /SELECT created_at FROM monthly_memos/,
    "created_at survives regeneration and cannot answer this question");
});

test("overdue is computed from the written timestamp", () => {
  assert.match(block, /monthlyRefreshOverdue\(now, memo\.written, 26\)/);
});

test("a client with no memo at all is still skipped, not alerted", () => {
  assert.match(block, /if \(!memo\?\.written\) continue/,
    "a brand-new customer must not read as overdue");
});

test("the alert says what it actually checked", () => {
  assert.match(block, /has been WRITTEN this month/,
    "the wording must match the thing measured, or the next reader repeats the mistake");
});

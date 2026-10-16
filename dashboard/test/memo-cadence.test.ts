/* Decided 2026-10-05: each readout covers a FULL calendar month and is drafted
 * on the 2nd of the next month, as the client was told at kickoff. The old
 * 24th-of-the-month draft missed every month's last week (September stopped
 * at the 25th) and compared a partial month with a full one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MEMO_DRAFT_DAY, endOfPreviousMonthUTC } from "../src/cron";

test("the full-month draft runs on the 2nd", () => {
  assert.equal(MEMO_DRAFT_DAY, 2);
});

test("on Nov 2 the generator's clock is the last second of October", () => {
  assert.equal(endOfPreviousMonthUTC(new Date("2026-11-02T06:00:00Z")).toISOString(), "2026-10-31T23:59:59.000Z");
  // Year boundary.
  assert.equal(endOfPreviousMonthUTC(new Date("2027-01-02T06:00:00Z")).toISOString(), "2026-12-31T23:59:59.000Z");
});

test("the 24th draft is gone, the 15th preview stays on the current month", () => {
  const src = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /isPreview \|\| dayOfMonth === 24/);
  assert.match(src, /const clock = isPreview \? new Date\(\) : endOfPreviousMonthUTC\(new Date\(\)\);/);
});

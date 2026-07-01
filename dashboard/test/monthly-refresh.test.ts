import { test } from "node:test";
import { strict as assert } from "node:assert";
import { monthlyRefreshOverdue } from "../src/lib/monthly-refresh";

const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);

test("in the grace window (before graceDay), a stale snapshot is NOT yet overdue", () => {
  // Aug 2; last refresh landed on Jul 1 -> stale, but still within grace.
  assert.equal(
    monthlyRefreshOverdue(new Date("2026-08-02T12:00:00Z"), secs("2026-07-01T21:40:00Z")),
    false,
  );
});

test("past graceDay with no refresh this month -> OVERDUE (the missed-cron case)", () => {
  // Aug 5; last refresh is Jul 1 (before Aug 1) -> the Aug run never landed.
  assert.equal(
    monthlyRefreshOverdue(new Date("2026-08-05T12:00:00Z"), secs("2026-07-01T21:40:00Z")),
    true,
  );
});

test("this month's refresh already landed -> NOT overdue", () => {
  // Aug 5; refresh landed Aug 1 -> fresh.
  assert.equal(
    monthlyRefreshOverdue(new Date("2026-08-05T12:00:00Z"), secs("2026-08-01T21:40:00Z")),
    false,
  );
});

test("a delayed-but-landed refresh (e.g. cron ran late on the 3rd) clears the flag", () => {
  // Aug 6; the run landed late on Aug 3, still this month -> not overdue.
  assert.equal(
    monthlyRefreshOverdue(new Date("2026-08-06T12:00:00Z"), secs("2026-08-03T02:00:00Z")),
    false,
  );
});

test("a missing/zero snapshot timestamp is overdue once past grace", () => {
  assert.equal(monthlyRefreshOverdue(new Date("2026-08-05T12:00:00Z"), 0), true);
  // ...but still respects grace on the 1st-3rd (no false alarm right after go-live).
  assert.equal(monthlyRefreshOverdue(new Date("2026-08-01T12:00:00Z"), 0), false);
});

test("today's exact scenario: Jul 1, HTC refreshed today -> not overdue, and grace holds on the 1st", () => {
  // The manual re-trigger landed Jul 1; checking on Jul 1 (day 1 < grace) -> false.
  assert.equal(
    monthlyRefreshOverdue(new Date("2026-07-01T22:00:00Z"), secs("2026-07-01T21:40:00Z")),
    false,
  );
});

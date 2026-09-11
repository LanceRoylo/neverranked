import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hstMonthKey } from "../src/lib/hst-month.ts";

/**
 * A grader hold is not a send failure and must not retry like one.
 *
 * The digest is due when a pass has landed since the last send. A held send
 * never advances that, which is deliberate: the retry exists so a transient
 * failure gets another chance. But a hold is a verdict on content built from
 * a specific set of passes, and rebuilding from the same passes yields the
 * same document and the same verdict. Result: 43 holds in 30 days, 0 client
 * deliveries, and the same wording on day 9 as on day 1.
 *
 * The due rule is now: monthMax > max(atLastSend, heldAtPasses).
 */
function due(monthMax: number, atLastSend: number, heldAtPasses: number): boolean {
  return monthMax > Math.max(atLastSend, heldAtPasses);
}

describe("a hold suppresses the retry until new data lands", () => {
  test("held on pass 2, still pass 2 tomorrow, not due", () => {
    assert.equal(due(2, 0, 2), false);
  });

  test("held on pass 2, pass 3 lands, due again with new input", () => {
    assert.equal(due(3, 0, 2), true);
  });

  test("a failed send writes no watermark, so its retry survives", () => {
    // This is the case the daily retry was built for and must keep working.
    assert.equal(due(2, 0, 0), true);
  });

  test("a real send still gates the next one", () => {
    assert.equal(due(2, 2, 0), false);
    assert.equal(due(3, 2, 0), true);
  });

  test("send and hold watermarks take the later of the two", () => {
    // Sent at pass 1, later held at pass 3: pass 3 must not re-fire.
    assert.equal(due(3, 1, 3), false);
    assert.equal(due(4, 1, 3), true);
  });
});

describe("the month key the gate asks in", () => {
  test("HST, not UTC, or the gate goes blind at the boundary", () => {
    // 2026-10-01 05:00 UTC is still 2026-09-30 in HST. Asking in UTC would
    // look for October heartbeats that do not exist yet.
    assert.equal(hstMonthKey(new Date("2026-10-01T05:00:00Z")), "2026-09");
    assert.equal(hstMonthKey(new Date("2026-10-01T11:00:00Z")), "2026-10");
  });
});

/**
 * monthly-refresh.ts — is a managed customer's monthly measurement overdue?
 *
 * The monthly measurement fires on the 1st via a GitHub scheduled cron, which
 * is best-effort and can be delayed or skip entirely (verified 2026-07-01: the
 * workflow's first scheduled occurrence did not fire). This answers, given
 * "now" and the epoch-seconds timestamp of a customer's latest readout
 * snapshot: has THIS month's refresh failed to land yet? runDailyTasks uses it
 * to fire a needs-you alert so a missed run surfaces in the queue instead of
 * the customer's cockpit / memo / Atlas silently aging on last month's numbers.
 *
 * Pure + deterministic so it can be unit-tested without D1 or the worker.
 */
export function monthlyRefreshOverdue(
  now: Date,
  snapshotTsSecs: number,
  graceDay = 4,
): boolean {
  // Grace through (graceDay - 1) of the month: covers a delayed cron, weekends,
  // the ~2.5h run duration, and a manual re-trigger window. Only flag once we
  // are genuinely past due for the month.
  if (now.getUTCDate() < graceDay) return false;
  const startOfMonthSecs = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
  );
  // Overdue if the latest snapshot predates the 1st of the current month — i.e.
  // this month's refresh has not landed. A missing/zero timestamp is overdue.
  return (snapshotTsSecs || 0) < startOfMonthSecs;
}

/**
 * Sweep-measured clients get a readout snapshot every MONDAY (weekly-extras,
 * 06:00 UTC), not on the 1st, so "nothing since the 1st by day 4" is the
 * wrong question for them. On 2026-10-04 it raised "Monthly measurement
 * overdue" for both paying clients with a snapshot six days old, because the
 * month's first Monday was the 5th.
 *
 * For them the honest question is age: has a Monday been missed? Nine days is
 * one weekly cycle plus two days for a late or retried workflow.
 */
export const WEEKLY_SNAPSHOT_MAX_AGE_DAYS = 9;

export function weeklySnapshotOverdue(nowSecs: number, snapshotTsSecs: number): boolean {
  if (!snapshotTsSecs) return true;
  return nowSecs - snapshotTsSecs > WEEKLY_SNAPSHOT_MAX_AGE_DAYS * 86400;
}

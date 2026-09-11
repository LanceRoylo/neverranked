/**
 * hst-month.ts — one definition of "which month is it" for the digest gate.
 *
 * measurement_heartbeats.month is written in HST. Any code that reads it must
 * ask in the same calendar, or a UTC evening looks like next month and the
 * gate goes silently blind at every month boundary.
 *
 * Extracted from cron.ts on 2026-09-11 because email.ts now needs it too, to
 * stamp the hold watermark (migration 0116). cron.ts already imports email.ts,
 * so importing back the other way would close a cycle. Two private copies of a
 * date rule is how the boundary bug comes back, and this codebase has paid for
 * that shape enough times today.
 */

/** HST month key, e.g. '2026-09'. */
export function hstMonthKey(now: Date): string {
  return new Date(now.getTime() - 10 * 3600 * 1000).toISOString().slice(0, 7);
}

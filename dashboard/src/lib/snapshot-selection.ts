/**
 * snapshot-selection.ts — choosing the citation_snapshots row for a report month.
 *
 * WHY THIS EXISTS. buildReportFacts read the newest snapshot that existed,
 * then refused it when week_start landed past the report month's end. Two
 * operations in the wrong order: it threw away the CORRECT row along with the
 * wrong one, because it never asked for the correct one.
 *
 * The cost is dated and lands on a live customer URL. Every writer keys rows
 * by the Monday of the week it RAN, while buildReadoutSnapshot aggregates
 * MONTH TO DATE, so a month accumulates one row per Monday and the last one
 * holds the complete month. On the first Monday of the NEXT month a new row
 * appears covering a handful of days, becomes "newest", and the previous
 * month's readout stops rendering numbers even though its complete row is
 * still sitting in the table.
 *
 * Traced 2026-09-08 against live rows: the September readout renders through
 * October 4 and goes narrative-only on October 5. The monthly deliverable is
 * a live URL the customer can reopen at any time, so this is not a
 * generation-time problem that passes.
 *
 * The fix is to scope the QUERY by month rather than filter after the fact.
 * The guards below are what remains once the right row is in hand, extracted
 * so all three refusals can be tested without a live database.
 */

export interface MonthBounds {
  start: number;
  end: number;
  priorStart: number;
}

export interface SnapshotCandidate {
  engines_breakdown: string;
  top_competitors: string;
  week_start: number;
  measured_at: number | null;
}

export type SnapshotVerdict =
  | { ok: true }
  | { ok: false; reason: "legacy_shape" | "newer_than_month" | "too_stale"; detail: string };

/**
 * Is this row usable as the facts for `bounds`?
 *
 * Every branch fails CLOSED. A readout that renders no numbers is a readout
 * the customer can ask about. A readout that renders the wrong month's
 * numbers under this month's heading is one they cannot detect.
 */
export function snapshotUsableForMonth(
  snap: SnapshotCandidate,
  bounds: MonthBounds | null,
  isReadoutShape: (eb: string, tc: string) => boolean,
): SnapshotVerdict {
  // Legacy-shape rows have no share_pct, so every chart would freeze all-zero
  // into a delivered, immutable report.
  if (!isReadoutShape(snap.engines_breakdown, snap.top_competitors)) {
    return { ok: false, reason: "legacy_shape", detail: "legacy-shape snapshot (no share_pct)" };
  }

  // An unparseable month key cannot scope anything. Keep the row rather than
  // invent bounds for it.
  if (!bounds) return { ok: true };

  // Belt and braces. The query now filters on this, so reaching here means
  // the caller passed a row it did not scope, and asserting the month is
  // cheaper than trusting every future caller to remember.
  if (snap.week_start >= bounds.end) {
    return { ok: false, reason: "newer_than_month", detail: "snapshot is newer than the report month" };
  }

  // Staleness is a question of DEGREE, not kind. monthKey is the DELIVERY
  // month and data always predates its label by design, so a same-month rule
  // would fail closed on every correct report. One month back is the cadence.
  // Three months back is a stale snapshot wearing a fresh date.
  //
  // A null measured_at cannot prove when it was measured, which is not a
  // reason to trust it.
  if (typeof snap.measured_at !== "number" || snap.measured_at < bounds.priorStart) {
    const seen = typeof snap.measured_at === "number"
      ? new Date(snap.measured_at * 1000).toISOString().slice(0, 10)
      : "unknown";
    return { ok: false, reason: "too_stale", detail: `measured ${seen}, before the prior month` };
  }

  return { ok: true };
}

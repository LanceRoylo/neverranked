import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotUsableForMonth, type MonthBounds, type SnapshotCandidate } from "../src/lib/snapshot-selection.ts";

/**
 * buildReportFacts took the newest snapshot that existed, then refused it for
 * being newer than the report month. Two operations in the wrong order: it
 * discarded the correct row along with the wrong one, because it never asked
 * for the correct one.
 *
 * Traced against live rows on 2026-09-08: a September readout renders through
 * October 4 and goes narrative-only on October 5, when the first October row
 * lands and becomes "newest". September's complete row is two rows down the
 * whole time. The deliverable is a live URL, so the customer sees the
 * degraded version, not a stale-but-correct one.
 */

const ts = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
const SEPT: MonthBounds = { start: ts(2026, 9, 1), end: ts(2026, 10, 1), priorStart: ts(2026, 8, 1) };
const readoutShape = () => true;
const legacyShape = () => false;

const row = (over: Partial<SnapshotCandidate> = {}): SnapshotCandidate => ({
  engines_breakdown: '{"Perplexity":{"share_pct":2}}',
  top_competitors: '{"htc_venue_share_pct":12}',
  week_start: ts(2026, 9, 28),
  measured_at: ts(2026, 9, 28),
  ...over,
});

test("REGRESSION: September's complete row stays usable after October starts", () => {
  // The Sept 28 row holds the full month. Nothing about October changes that.
  assert.deepEqual(snapshotUsableForMonth(row(), SEPT, readoutShape), { ok: true });
});

test("an October row is still refused for a September report", () => {
  // The query no longer hands this row over, but the guard must hold for any
  // caller that forgets to scope, which is how this started.
  const v = snapshotUsableForMonth(row({ week_start: ts(2026, 10, 5), measured_at: ts(2026, 10, 5) }), SEPT, readoutShape);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, "newer_than_month");
});

test("a legacy-shape row is refused before anything else is considered", () => {
  // It has no share_pct, so every chart would freeze all-zero into a
  // delivered, immutable report.
  const v = snapshotUsableForMonth(row(), SEPT, legacyShape);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, "legacy_shape");
});

test("data measured BEFORE the label is normal and must not be refused", () => {
  // monthKey is the DELIVERY month. Data predating its label is the design,
  // not a fault: an August report legitimately carries data measured July 31.
  const v = snapshotUsableForMonth(row({ measured_at: ts(2026, 8, 31) }), SEPT, readoutShape);
  assert.equal(v.ok, true);
});

test("three months back is a stale snapshot wearing a fresh date", () => {
  const v = snapshotUsableForMonth(row({ measured_at: ts(2026, 6, 26) }), SEPT, readoutShape);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, "too_stale");
  assert.match(v.ok === false ? v.detail : "", /2026-06-26/);
});

test("a null measured_at cannot prove its age, so it is refused", () => {
  const v = snapshotUsableForMonth(row({ measured_at: null }), SEPT, readoutShape);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, "too_stale");
  assert.match(v.ok === false ? v.detail : "", /unknown/);
});

test("an unparseable month key keeps the row rather than inventing bounds", () => {
  // Shape is still checked. Only the month-scoped questions are skipped.
  assert.deepEqual(snapshotUsableForMonth(row(), null, readoutShape), { ok: true });
  assert.equal(snapshotUsableForMonth(row(), null, legacyShape).ok, false);
});

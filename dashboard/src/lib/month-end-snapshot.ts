/**
 * month-end-snapshot.ts — the snapshot a full-month readout is drafted from.
 *
 * WHY THIS EXISTS (decided 2026-10-05). The readout covers a whole calendar
 * month and drafts on the 2nd of the next one. Its snapshot-based figures
 * (per-engine own-site shares, venue share, the source mix) used to come from
 * the newest WEEKLY snapshot of the month. Weekly rows are built on Mondays
 * over the month to date, so the last one of a month stops at its last Monday:
 * October 2026's would have covered roughly the 1st to the 26th, and
 * September's real row stopped at 06:06 on the 28th.
 *
 * So on the 1st of every month (runMonthStartWork, the 06:45 trigger) one more
 * snapshot is built per measured client over EXACTLY
 *
 *     [first second of the previous month, first second of this month)
 *
 * floored at measurement_start. The upper bound excludes the new month's 06:00
 * sweep, which lands at run_at >= the 1st. The row is keyed at the month's last
 * second (week_start = end - 1). Every other writer keys on a Monday at
 * 00:00:00, so the key can never collide with a weekly row, and it is the
 * greatest week_start inside the month, which is the row every month-scoped
 * reader (gatherMemoInputs, buildReportFacts) already selects.
 *
 * FAILS CLOSED, LOUDLY. The full-month draft on the 2nd checks for the row and
 * that it covers the whole month. If not, it builds it once. If that fails,
 * the client is not drafted from a partial snapshot and a high-urgency inbox
 * item names the client and the month. A guard that refuses silently is
 * indistinguishable from the work never running.
 */

import type { Env } from "../types";
import { isReadoutShapeSnapshot } from "./snapshot-shape";

/** top_competitors.snapshot_kind on a month-end build. Absent on weekly rows. */
export const MONTH_END_KIND = "month_end" as const;

export interface MonthWindow {
  /** First second of the month, UTC. */
  start: number;
  /** First second of the NEXT month, UTC. Exclusive. */
  end: number;
  /** YYYY-MM */
  monthKey: string;
}

function windowFromParts(year: number, monthIndex: number): MonthWindow {
  const start = Math.floor(Date.UTC(year, monthIndex, 1) / 1000);
  const end = Math.floor(Date.UTC(year, monthIndex + 1, 1) / 1000);
  const d = new Date(start * 1000);
  const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, monthKey };
}

/** The calendar month that contains `d`, in UTC. */
export function monthWindowOf(d: Date): MonthWindow {
  return windowFromParts(d.getUTCFullYear(), d.getUTCMonth());
}

/** The calendar month before the one that contains `d`, in UTC. */
export function previousMonthWindow(d: Date): MonthWindow {
  return windowFromParts(d.getUTCFullYear(), d.getUTCMonth() - 1);
}

/** 'YYYY-MM' to its window, or null for anything that is not a month key. */
export function monthWindowForKey(monthKey: string): MonthWindow | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return windowFromParts(Number(m[1]), mo - 1);
}

/** The last second of the month before `d`, in UTC. The memo generator reports
 *  the month its clock is in, so this makes it draft last month in full. */
export function endOfPreviousMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 1000);
}

/** The month-end row's key: the month's last second. Never a Monday 00:00. */
export function monthEndSnapshotKey(w: MonthWindow): number {
  return w.end - 1;
}

/** The clock to re-read a memo's inputs with. A memo for a month that has
 *  ended is read at that month's last second, the clock it was drafted on.
 *  Re-vetting an October memo on 3 November with the wall clock used to read
 *  November's first days and call them the memo's month. */
export function memoClockFor(monthKey: string, now: Date): Date {
  const w = monthWindowForKey(monthKey);
  if (!w) return now;
  return w.end <= Math.floor(now.getTime() / 1000) ? new Date((w.end - 1) * 1000) : now;
}

/** Where a month-end snapshot of `w` must start: the month's first second, or
 *  measurement_start when the engagement began inside the month. */
export function expectedWindowStart(w: MonthWindow, measurementStart: number | null): number {
  return typeof measurementStart === "number" && Number.isFinite(measurementStart) && measurementStart > w.start
    ? measurementStart
    : w.start;
}

export interface StoredSnapshotRow {
  week_start: number;
  measured_at: number | null;
  engines_breakdown: string;
  top_competitors: string;
}

export type MonthEndVerdict =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_engaged"
        | "missing"
        | "not_readout_shape"
        | "not_month_end"
        | "window_mismatch"
        | "built_before_month_closed";
      detail: string;
    };

/**
 * Does this stored row cover the WHOLE of `w`? Pure, so every refusal can be
 * tested without a database.
 *
 * Covering means: readout shape, built as a month-end snapshot, its recorded
 * window is exactly [expected start, w.end), and it was built after the month
 * closed. A row built before the month ended could not have seen the last
 * runs, whatever window it claims.
 */
export function monthEndSnapshotCovers(
  row: StoredSnapshotRow | null,
  w: MonthWindow,
  measurementStart: number | null,
): MonthEndVerdict {
  const start = expectedWindowStart(w, measurementStart);
  if (start >= w.end) {
    return { ok: false, reason: "not_engaged", detail: `measurement starts after ${w.monthKey}` };
  }
  if (!row) return { ok: false, reason: "missing", detail: `no snapshot keyed at the end of ${w.monthKey}` };
  if (!isReadoutShapeSnapshot(row.engines_breakdown, row.top_competitors)) {
    return { ok: false, reason: "not_readout_shape", detail: "the row is not readout-shaped" };
  }
  let tc: { snapshot_kind?: unknown; window?: { start?: unknown; end?: unknown } } = {};
  try { tc = JSON.parse(row.top_competitors || "{}") ?? {}; } catch { /* treated as no window below */ }
  if (tc.snapshot_kind !== MONTH_END_KIND) {
    return { ok: false, reason: "not_month_end", detail: "the row was not built as a month-end snapshot" };
  }
  const ws = Number(tc.window?.start);
  const we = Number(tc.window?.end);
  if (ws !== start || we !== w.end) {
    const show = (n: number) => (Number.isFinite(n) ? new Date(n * 1000).toISOString() : "unrecorded");
    return {
      ok: false,
      reason: "window_mismatch",
      detail: `covers ${show(ws)} to ${show(we)}, expected ${show(start)} to ${show(w.end)}`,
    };
  }
  if (typeof row.measured_at !== "number" || row.measured_at < w.end) {
    return { ok: false, reason: "built_before_month_closed", detail: "built before the month had ended" };
  }
  return { ok: true };
}

async function measurementStartOf(env: Env, slug: string): Promise<number | null> {
  const r = await env.DB.prepare(
    "SELECT measurement_start FROM measurement_registry WHERE client_slug = ?",
  ).bind(slug).first<{ measurement_start: number | null }>();
  const v = Number(r?.measurement_start);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function loadMonthEndSnapshot(env: Env, slug: string, w: MonthWindow): Promise<StoredSnapshotRow | null> {
  return (await env.DB.prepare(
    `SELECT week_start, measured_at, engines_breakdown, top_competitors FROM citation_snapshots
      WHERE client_slug = ? AND week_start = ?`,
  ).bind(slug, monthEndSnapshotKey(w)).first<StoredSnapshotRow>()) ?? null;
}

/** Build (or rebuild) one client's month-end snapshot for `w`. */
export async function buildMonthEndSnapshot(env: Env, slug: string, w: MonthWindow) {
  const { buildReadoutSnapshot } = await import("../citations");
  return buildReadoutSnapshot(env, slug, w.start, w.end, { keyAt: monthEndSnapshotKey(w), kind: MONTH_END_KIND });
}

export type EnsureResult =
  | { ok: true; rebuilt: boolean }
  | { ok: false; reason: string; detail: string };

/**
 * The draft path's guard. Checks the row, builds it ONCE if it is missing or
 * short, and checks again. Never throws: a failure is a result the caller
 * must act on.
 */
export async function ensureMonthEndSnapshot(env: Env, slug: string, w: MonthWindow): Promise<EnsureResult> {
  try {
    const mStart = await measurementStartOf(env, slug);
    const first = monthEndSnapshotCovers(await loadMonthEndSnapshot(env, slug, w), w, mStart);
    if (first.ok) return { ok: true, rebuilt: false };
    if (first.reason === "not_engaged") return first;
    console.log(`[month-end] ${slug} ${w.monthKey}: ${first.reason} (${first.detail}); building once in the draft path`);
    const built = await buildMonthEndSnapshot(env, slug, w);
    const again = monthEndSnapshotCovers(await loadMonthEndSnapshot(env, slug, w), w, mStart);
    if (again.ok) return { ok: true, rebuilt: true };
    return {
      ok: false,
      reason: again.reason,
      detail: built.ok ? again.detail : `the build refused (${built.reason ?? "unknown"}); before that: ${first.detail}`,
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function monthLabel(monthKey: string): string {
  const w = monthWindowForKey(monthKey);
  if (!w) return monthKey;
  const d = new Date(w.start * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The needs-you item for a client whose full-month memo was NOT drafted. */
export function monthEndMissingInboxItem(i: { clientSlug: string; monthKey: string; reason: string; detail: string }) {
  const label = monthLabel(i.monthKey);
  return {
    kind: "month_end_snapshot_missing",
    title: `Monthly memo NOT drafted: ${i.clientSlug}, ${label}`,
    body:
      `The ${label} memo for ${i.clientSlug} was not drafted because its month-end snapshot ` +
      `is not usable (${i.reason}: ${i.detail}). One rebuild was tried in the draft path and did not fix it. ` +
      `It was not drafted from a partial snapshot on purpose: the readout covers the whole month. ` +
      `Fix the cause (the reason above names it), then open /admin/memos and use "Draft ${label} in full", ` +
      `which rebuilds the month-end snapshot once before drafting.`,
    action_url: "/admin/memos",
    target_type: `month_end:${i.clientSlug}:${i.monthKey}`,
    target_id: 0,
    target_slug: i.clientSlug,
    urgency: "high" as const,
  };
}

export interface MonthEndBuildResult {
  month: string;
  built: string[];
  failed: Array<{ slug: string; reason: string }>;
}

/**
 * The 1st-of-month build, for every active sweep-measured client.
 *
 * Each client is built in its own try/catch and records its own cron_runs row
 * (task month_end_snapshot), so one refusal never stops the next client and
 * every outcome is on the record.
 *
 * COST, per client: about eleven D1 queries (the cohort, registry, name and
 * question-set lookups, one SELECT of the month's runs, one INSERT) plus one
 * cron_runs write. The runs SELECT is the weight: a full
 * month of runs with their cited URLs and entities, measured 2026-10-05 at
 * about 1.7 KB a row, so about 1.7 MB for every thousand runs the month
 * holds. Builds run one after another, never in
 * parallel, so peak memory is one client's month.
 */
export async function buildMonthEndSnapshots(env: Env, nowMs: number): Promise<MonthEndBuildResult> {
  const w = previousMonthWindow(new Date(nowMs));
  const out: MonthEndBuildResult = { month: w.monthKey, built: [], failed: [] };
  const { logCronRun } = await import("./cron-log");
  let clients: Array<{ client_slug: string }> = [];
  try {
    clients = (await env.DB.prepare(
      `SELECT client_slug FROM measurement_registry WHERE active = 1 AND snapshot_source = 'sweep'`,
    ).all<{ client_slug: string }>()).results;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.failed.push({ slug: "_registry", reason: msg });
    await logCronRun(env, "month_end_snapshot", "failure", 0, `${w.monthKey}: client list unreadable: ${msg}`);
    return out;
  }
  for (const { client_slug: slug } of clients) {
    const started = Date.now();
    try {
      const mStart = await measurementStartOf(env, slug);
      if (expectedWindowStart(w, mStart) >= w.end) {
        await logCronRun(env, "month_end_snapshot", "success", Date.now() - started, `${slug} ${w.monthKey}: not engaged that month, nothing to build`);
        continue;
      }
      const res = await buildMonthEndSnapshot(env, slug, w);
      if (res.ok) {
        out.built.push(slug);
        await logCronRun(env, "month_end_snapshot", "success", Date.now() - started, `${slug} ${w.monthKey}: built`);
      } else {
        out.failed.push({ slug, reason: res.reason ?? "unknown" });
        await logCronRun(env, "month_end_snapshot", "failure", Date.now() - started, `${slug} ${w.monthKey}: refused (${res.reason ?? "unknown"})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.failed.push({ slug, reason: msg });
      await logCronRun(env, "month_end_snapshot", "failure", Date.now() - started, `${slug} ${w.monthKey}: ${msg}`);
    }
  }
  return out;
}

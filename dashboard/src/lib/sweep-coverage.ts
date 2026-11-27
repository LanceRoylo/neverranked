/**
 * sweep-coverage.ts — did every keyword we dispatched actually write a row?
 *
 * WHY THIS EXISTS. On 2026-09-10 the nightly sweep began dispatching 78
 * keywords and writing 67. Eleven keywords belonging to one client produced
 * zero rows on every engine, every night, for five consecutive nights. Nothing
 * alerted. The client was found on 2026-09-14 only because a human read a
 * weekly email and asked why a number looked stale.
 *
 * Every existing check was engine-shaped and therefore blind to it:
 *
 *   anomaly_engine_row_drop   compares an engine to its own 14-day baseline.
 *                             All seven surfaces dropped by the same 11, so
 *                             every engine stayed in proportion to itself.
 *   anomaly_engine_peer_drop  compares engines to each other. All seven lost
 *                             the same keywords, so the peers agreed.
 *   engine_health_check       measures empty-response RATE. The eleven never
 *                             produced a response to be empty.
 *
 * A row that is never written is not a row that came back wrong, and nothing
 * in the fleet was watching the difference between what we asked for and what
 * we got. That is the same shape as a guard reporting success while measuring
 * nothing: the failure is the ABSENCE, and absence is invisible to every check
 * that reasons about what is present.
 *
 * So this one does not look at engines at all. It starts from the keywords the
 * planner selected and asks which of them are silent everywhere.
 *
 * ON THE WINDOW. 24 hours ending now, run at 17:00 UTC against a sweep that
 * dispatches at 06:00. Yesterday's rows fall outside it, so one missed night
 * is caught on the first morning rather than after five.
 *
 * ON WAITING FOR THE SWEEP TO FINISH. This used to assume the sweep settled
 * within ~20 minutes and judged it at 06:30 regardless. That assumption aged
 * out as the active keyword count grew: on 2026-09-25, with 63 active
 * keywords, rows were still landing at 06:41 and this fired at 06:30:46
 * reporting two of prince-waikiki's keywords dark. Both had simply not been
 * reached yet, and both wrote minutes later. The same false alarm fired on
 * 2026-09-17 and also self-resolved.
 *
 * A guard that cries wolf gets skimmed, and skimming it is how the real one
 * gets missed -- which is the precise failure this file was written to close.
 * So it now DETECTS completion rather than assuming it, and defers when the
 * sweep is still writing.
 *
 * ON WHEN IT RUNS. Deferring was called safe because "the check runs every
 * morning". That stopped being true on 2026-09-26: the sweep began spreading
 * over 40 minutes, so at 06:30 it was still writing every single night, the
 * next pass deferred the same way, and this logged success with dark=0/0 for
 * 42 nights without judging one. The 06:45 trigger would not have fixed it:
 * the last rows land around 06:40:45, inside the five minute quiet period. So
 * it runs at 17:00, ahead of the morning briefing, ten hours clear of the
 * sweep. A deferral now logs as a deferral, and a second one in a row alerts.
 */

import type { Env } from "../types";

const WINDOW_SECONDS = 24 * 60 * 60;
const ALERT_TYPE = "sweep_keywords_dark";
const DEFERRED_ALERT_TYPE = "sweep_coverage_deferred";
/** Starts a cron_runs detail when the check judged nothing. */
export const DEFERRED_DETAIL = "deferred: sweep still writing, no night judged";

/** One active keyword and how many rows it wrote in the window. */
export interface KeywordCoverage {
  clientSlug: string;
  keywordId: number;
  keyword: string;
  rowsWritten: number;
}

export interface ClientCoverage {
  clientSlug: string;
  active: number;
  dark: number;
}

export interface SweepCoverageSummary {
  activeKeywords: number;
  darkKeywords: number;
  /** Only clients with at least one dark keyword, worst first. */
  affected: ClientCoverage[];
  /** Clients whose every active keyword is dark. The and-scene shape. */
  fullyDark: string[];
}

/**
 * Pure. Split out from the D1 read so the interesting logic is testable
 * against real production shapes without a database.
 *
 * DARK means zero rows on every engine. A keyword that wrote on four engines
 * and not the other three is a DIFFERENT problem — that is an engine fault,
 * and three checks already watch for it. Widening this one to cover partial
 * coverage too would make it fire on every ordinary Google AI Overviews night
 * (that surface legitimately declines to answer ~55% of questions) and a check
 * that cries wolf nightly is one nobody reads.
 */
export function summarizeCoverage(rows: KeywordCoverage[]): SweepCoverageSummary {
  const byClient = new Map<string, ClientCoverage>();
  for (const r of rows) {
    let c = byClient.get(r.clientSlug);
    if (!c) {
      c = { clientSlug: r.clientSlug, active: 0, dark: 0 };
      byClient.set(r.clientSlug, c);
    }
    c.active += 1;
    if (r.rowsWritten === 0) c.dark += 1;
  }

  const affected = [...byClient.values()]
    .filter((c) => c.dark > 0)
    .sort((a, b) => b.dark - a.dark || a.clientSlug.localeCompare(b.clientSlug));

  return {
    activeKeywords: rows.length,
    darkKeywords: rows.filter((r) => r.rowsWritten === 0).length,
    affected,
    fullyDark: affected.filter((c) => c.dark === c.active).map((c) => c.clientSlug),
  };
}

/**
 * Human-readable alert body. Names the client and the count, because "sweep
 * coverage degraded" is not something anyone can act on.
 */
export function describeCoverage(s: SweepCoverageSummary): string {
  const lines = [
    `${s.darkKeywords} of ${s.activeKeywords} active keywords wrote no row on any engine in the last 24h.`,
    "",
  ];
  for (const c of s.affected) {
    const all = c.dark === c.active ? " — EVERY keyword for this client is dark" : "";
    lines.push(`  ${c.clientSlug}: ${c.dark}/${c.active} dark${all}`);
  }
  lines.push("");
  lines.push(
    "Dark means dispatched and silent, not answered badly. Check that the keyword's " +
      "workflows are being created (cron_runs + worker logs for the 06:00 UTC dispatch) " +
      "before checking any engine: every measured surface agreeing is evidence the " +
      "engines are fine and the dispatch is not.",
  );
  return lines.join("\n");
}

/** Stable per-day fingerprint so a persisting outage re-alerts daily rather
 *  than once, and two different outages do not suppress each other. */
export function coverageFingerprint(s: SweepCoverageSummary): string {
  return `dark:${s.affected.map((c) => `${c.clientSlug}=${c.dark}`).join(",")}`;
}

/**
 * Read the active roster and its row counts. Mirrors planCitationRun's own
 * WHERE clause (`citation_keywords.active = 1`) deliberately: the question this
 * check asks is "did everything the planner selected actually land", so it has
 * to start from the same set the planner starts from. If that filter ever
 * changes, this one changes with it.
 */
export async function fetchSweepCoverage(env: Env, nowSecs: number): Promise<KeywordCoverage[]> {
  const since = nowSecs - WINDOW_SECONDS;
  const rows = (await env.DB.prepare(
    `SELECT k.client_slug AS clientSlug,
            k.id         AS keywordId,
            k.keyword    AS keyword,
            (SELECT COUNT(*) FROM citation_runs r
              WHERE r.keyword_id = k.id AND r.run_at >= ?) AS rowsWritten
       FROM citation_keywords k
      WHERE k.active = 1
      ORDER BY k.client_slug, k.id`,
  ).bind(since).all<KeywordCoverage>()).results;
  return rows ?? [];
}

export interface SweepCoverageResult extends SweepCoverageSummary {
  alerted: boolean;
  /** True when it judged nothing because the sweep was still writing. */
  deferred?: boolean;
}

/**
 * The check itself. Raises ONE alert naming every affected client rather than
 * one per keyword: eleven alerts saying the same thing is how a real signal
 * gets buried, and burial is the failure this exists to prevent.
 */
/** Seconds of silence that mean the sweep has stopped writing. Comfortably
 *  longer than the gap between consecutive writes within one sweep, and far
 *  shorter than the gap between sweeps. */
const QUIESCENCE_SECONDS = 5 * 60;

/** Is the sweep still writing right now? A keyword it has not reached yet is
 *  not dark, and must never be reported as such.
 *
 *  Google AI Overviews is left out. A keyword is dark only when no engine
 *  wrote for it, so rows from one engine arriving late say nothing about
 *  keywords the sweep has not reached, and deferred AI Overviews retries write
 *  well after every other engine has finished. */
export async function sweepInFlight(env: Env, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT MAX(run_at) AS ts FROM citation_runs WHERE engine != 'google_ai_overview'",
  ).first<{ ts: number | null }>();
  if (!row?.ts) return false;
  return now - row.ts < QUIESCENCE_SECONDS;
}

/** A deferral is safe once. Twice in a row means nobody has judged a night,
 *  and a guard that silently stops judging is the failure this file exists to
 *  prevent, so it says so. This run's own row is not written yet: the last
 *  logged run is the previous one. */
async function alertIfDeferredAgain(env: Env, now: number): Promise<boolean> {
  try {
    const last = await env.DB.prepare(
      "SELECT detail FROM cron_runs WHERE task_name = 'sweep_coverage' ORDER BY ran_at DESC LIMIT 1",
    ).first<{ detail: string | null }>();
    if (!last?.detail?.startsWith("deferred")) return false;
    const dupe = await env.DB.prepare(
      "SELECT 1 AS one FROM admin_alerts WHERE type = ? AND read_at IS NULL LIMIT 1",
    ).bind(DEFERRED_ALERT_TYPE).first<{ one: number }>();
    if (dupe) return false;
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      "_system",
      DEFERRED_ALERT_TYPE,
      "Sweep coverage has deferred twice in a row: no night judged",
      "The check that catches keywords writing nothing found citation_runs still being written on two runs in a row, so it judged neither. Dark keywords would go unreported until this clears. Check whether the sweep now runs past the check, or is stuck writing.",
      now,
    ).run();
    return true;
  } catch (e) {
    console.log(`[sweep-coverage] CRITICAL: repeated deferral not alerted: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export async function checkSweepCoverage(env: Env): Promise<SweepCoverageResult> {
  const now = Math.floor(Date.now() / 1000);

  // Judge a finished sweep or none at all.
  try {
    if (await sweepInFlight(env, now)) {
      console.log("[sweep-coverage] sweep still writing; deferring to the next run rather than reporting unreached keywords as dark.");
      return { ...summarizeCoverage([]), alerted: await alertIfDeferredAgain(env, now), deferred: true };
    }
  } catch (e) {
    // If we cannot tell, behave as before rather than going silent.
    console.log(`[sweep-coverage] in-flight check failed, proceeding: ${e instanceof Error ? e.message : String(e)}`);
  }

  const summary = summarizeCoverage(await fetchSweepCoverage(env, now));

  if (summary.darkKeywords === 0) return { ...summary, alerted: false };

  const fingerprint = coverageFingerprint(summary);
  const since = now - WINDOW_SECONDS;
  const dupe = await env.DB.prepare(
    "SELECT 1 AS one FROM admin_alerts WHERE type = ? AND detail LIKE ? AND created_at > ? LIMIT 1",
  ).bind(ALERT_TYPE, `%${fingerprint}%`, since).first<{ one: number }>();
  if (dupe) return { ...summary, alerted: false };

  const worst = summary.affected[0];
  const title = summary.fullyDark.length
    ? `${summary.fullyDark.join(", ")}: every keyword dark`
    : `${summary.darkKeywords} keywords wrote nothing (worst: ${worst.clientSlug})`;

  try {
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind("_system", ALERT_TYPE, title, `${fingerprint}\n\n${describeCoverage(summary)}`.slice(0, 1500), now).run();
  } catch (e) {
    // Loud. A silent catch here recreates the exact blindness this file exists
    // to close.
    console.log(`[sweep-coverage] CRITICAL: alert not recorded: ${e instanceof Error ? e.message : String(e)}`);
    return { ...summary, alerted: false };
  }
  return { ...summary, alerted: true };
}

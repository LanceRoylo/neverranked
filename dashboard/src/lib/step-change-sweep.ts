/**
 * step-change-sweep.ts — runs the step detector and writes what it finds.
 *
 * `step-change.ts` is pure arithmetic. This is the part that talks to D1: it
 * builds the two windows, calls the detector per client and per engine, and
 * records a finding as an `instrument_events` row with source='detector'.
 *
 * WHY IT WRITES RATHER THAN ALERTS. comparePeriods() refuses to state a
 * movement across an instrument event, and instrument_events is the only thing
 * it reads. A detector that merely emailed somebody would leave the comparison
 * layer just as blind as it was on 2026-08-23, when Perplexity moved to the
 * Agent API and nothing recorded it. The row is the point. The alert is a
 * courtesy on top.
 *
 * WHAT IT REFUSES TO SAY. The kind written is `unexplained_step`, never
 * `engine_adapter_changed`. The detector sees a step in a number. It does not
 * know whether we changed an adapter, the engine changed its own behaviour, or
 * the client genuinely moved, and asserting a cause here would be the same
 * failure the whole comparison layer exists to prevent, one level up. A human
 * reclassifies it after looking.
 *
 * SCOPED TO SHARED QUESTIONS. Each client's two windows are intersected on
 * keyword_id first. Without that, a question set change would read as an engine
 * step, and we would be detecting one confound with another.
 */

import type { Env } from "../types";
import { detectStep, describeStep, WINDOW_DAYS, type StepCandidate } from "./step-change";

const DAY = 86_400;

/**
 * How long a detected step suppresses re-detection for the same client and
 * engine.
 *
 * A real step keeps showing up until the older window rolls past it, which
 * takes WINDOW_DAYS. Without suppression a daily sweep would write a near
 * identical row every morning for two weeks, and the unique index would not
 * stop it because the window boundary moves each day. Suppression is wider
 * than the window so the tail of one step cannot open a second row.
 */
export const RESUPPRESS_DAYS = WINDOW_DAYS * 2;

interface Row {
  client_slug: string;
  engine: string;
  prev_runs: number;
  prev_hits: number;
  cur_runs: number;
  cur_hits: number;
}

export interface SweepResult {
  checked: number;
  found: number;
  written: number;
  suppressed: number;
  details: string[];
}

/**
 * Compare the last WINDOW_DAYS against the WINDOW_DAYS before it, per client
 * and engine, over the questions measured in both.
 */
export async function sweepStepChanges(env: Env, nowSec?: number): Promise<SweepResult> {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  // The boundary is where a step would sit: the start of the current window.
  const boundary = now - WINDOW_DAYS * DAY;
  const start = boundary - WINDOW_DAYS * DAY;

  const rows = (await env.DB.prepare(
    `WITH both AS (
       SELECT cr.keyword_id
         FROM citation_runs cr
        WHERE cr.run_at >= ?2 AND cr.run_at < ?3
       INTERSECT
       SELECT cr.keyword_id
         FROM citation_runs cr
        WHERE cr.run_at >= ?1 AND cr.run_at < ?2
     )
     SELECT k.client_slug AS client_slug,
            cr.engine     AS engine,
            SUM(CASE WHEN cr.run_at <  ?2 THEN 1 ELSE 0 END) AS prev_runs,
            SUM(CASE WHEN cr.run_at <  ?2 AND cr.client_cited = 1 THEN 1 ELSE 0 END) AS prev_hits,
            SUM(CASE WHEN cr.run_at >= ?2 THEN 1 ELSE 0 END) AS cur_runs,
            SUM(CASE WHEN cr.run_at >= ?2 AND cr.client_cited = 1 THEN 1 ELSE 0 END) AS cur_hits
       FROM citation_runs cr
       JOIN citation_keywords k ON k.id = cr.keyword_id
      WHERE cr.run_at >= ?1 AND cr.run_at < ?3
        AND cr.keyword_id IN (SELECT keyword_id FROM both)
      GROUP BY k.client_slug, cr.engine
      ORDER BY k.client_slug, cr.engine`,
  ).bind(start, boundary, now).all<Row>()).results;

  const out: SweepResult = { checked: rows.length, found: 0, written: 0, suppressed: 0, details: [] };

  for (const r of rows) {
    const candidate: StepCandidate = {
      clientSlug: r.client_slug,
      engine: r.engine,
      before: { runs: r.prev_runs, hits: r.prev_hits },
      after: { runs: r.cur_runs, hits: r.cur_hits },
    };
    const finding = detectStep(candidate);
    if (!finding) continue;
    out.found++;

    // Already reported this client and engine recently?
    const recent = await env.DB.prepare(
      `SELECT 1 AS hit FROM instrument_events
        WHERE kind = 'unexplained_step'
          AND source = 'detector'
          AND engine = ?
          AND client_slug = ?
          AND occurred_at >= ?
        LIMIT 1`,
    ).bind(r.engine, r.client_slug, boundary - RESUPPRESS_DAYS * DAY)
     .first<{ hit: number }>()
     .catch(() => null);

    if (recent) {
      out.suppressed++;
      out.details.push(`${r.client_slug}/${r.engine}: step already recorded within ${RESUPPRESS_DAYS}d`);
      continue;
    }

    const detail = describeStep(finding);
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO instrument_events
         (occurred_at, detected_at, kind, scope, engine, client_slug, detail, source, created_at)
       VALUES (?, ?, 'unexplained_step', 'engine', ?, ?, ?, 'detector', ?)`,
    ).bind(boundary, now, r.engine, r.client_slug, detail, now).run().catch(() => null);

    if (res && (res.meta?.changes ?? 0) > 0) {
      out.written++;
      out.details.push(`${r.client_slug}/${r.engine}: ${finding.deltaPp.toFixed(1)}pp (z=${finding.z.toFixed(1)})`);

      // Courtesy notification. The row above is what the comparison layer
      // reads; this is so a person finds out without going looking.
      try {
        const { addInboxItem } = await import("../admin-inbox");
        await addInboxItem(env, {
          kind: "instrument_step_detected",
          title: `Unexplained step in ${r.engine} for ${r.client_slug}`,
          body:
            `${detail}\n\n` +
            `Recorded as an instrument_events row, so any month-over-month or ` +
            `week-over-week comparison spanning ${new Date(boundary * 1000).toISOString().slice(0, 10)} ` +
            `will now withhold rather than report a movement. ` +
            `If you can identify the cause, reclassify the row (engine_adapter_changed, ` +
            `engine_outage, question_set_changed) so the record says what actually happened.`,
          target_type: "instrument_event",
          target_slug: r.client_slug,
          urgency: "normal",
        });
      } catch (e) {
        console.log(`[step-sweep] inbox notify failed for ${r.client_slug}/${r.engine}: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      // The unique index caught a same-boundary duplicate. Not an error.
      out.suppressed++;
    }
  }

  return out;
}

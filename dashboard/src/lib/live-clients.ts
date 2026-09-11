/**
 * live-clients.ts — who an operator alert can actually be about.
 *
 * WHY THIS EXISTS. The morning briefing of 2026-09-10 carried five alerts,
 * all roadmap_stall and stale_item, and every one was for a slug with nobody
 * to nudge:
 *
 *   and-scene    a separate brand of Lance's. It has a domains row and a
 *                roadmap, no customers row, and its measurement is paused.
 *   neverranked  the company measuring itself. There is no customer here,
 *                and the alert text says "nudge the customer".
 *
 * Both sweeps grouped roadmap_items by client_slug with no check that the
 * slug belongs to a live customer, so any slug that has ever had a roadmap
 * generates operator alerts forever. The two paying-relevant slugs,
 * prince-waikiki and hawaii-theatre, produced none.
 *
 * That is the expensive kind of false alarm: it does not look broken, it
 * looks like work. An operator learns the alert lane is noise, and the day a
 * real client stalls it reads the same as the four that never mattered.
 *
 * ONE DEFINITION, TWO CALLERS. The stall sweep lives in safety-sweeps.ts and
 * the stale sweep lives in cron.ts. Filtering each separately is how the two
 * drift, which this codebase has paid for repeatedly. Both import this.
 *
 * DELIBERATELY INCLUDES UNPAID PILOTS. hawaii-theatre is $0 and is still a
 * real relationship with a real person to nudge. The test is whether there
 * is a customer, not whether they pay.
 */
import type { Env } from "../types";

/**
 * Slugs with a non-churned customers row, or NULL when that could not be
 * determined.
 *
 * THE NULL IS THE POINT. Returning an empty set on a failed query would
 * silence every alert and look exactly like a clean run with nothing to
 * report. That is a synthetic success, and this codebase's governing rule is
 * that a synthetic success is not a delivery. A caller that cannot tell who
 * is live must say so rather than quietly alerting on nobody.
 *
 * It also does not throw. These sweeps sit in a bare sequential await chain
 * inside runDailyMaintenance, so a throw here would skip every step after it
 * (stale agency apps, low queue, trial dormancy) for that run. The daily job
 * has an outer .catch, so the worker survives, but a partial run that looks
 * finished is worse than a skipped sweep that logged why.
 *
 * An EMPTY set is different from null and is meaningful: it means the query
 * ran and there are genuinely no live customers. Alert on nobody then, which
 * is correct.
 */
export async function liveClientSlugs(env: Env): Promise<Set<string> | null> {
  try {
    const rows = (await env.DB.prepare(
      "SELECT client_slug FROM customers WHERE status != 'churned'",
    ).all<{ client_slug: string }>()).results;
    return new Set(rows.map((r) => r.client_slug));
  } catch (e) {
    console.log(
      `[live-clients] could not read customers, SKIPPING client alerts this run: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

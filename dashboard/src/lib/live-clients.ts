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

/** Slugs with a non-churned customers row. Empty set means alert on nobody,
 *  which is the safe direction: a missed nudge costs less than an alert lane
 *  nobody reads. */
export async function liveClientSlugs(env: Env): Promise<Set<string>> {
  const rows = (await env.DB.prepare(
    "SELECT client_slug FROM customers WHERE status != 'churned'",
  ).all<{ client_slug: string }>()).results;
  return new Set(rows.map((r) => r.client_slug));
}

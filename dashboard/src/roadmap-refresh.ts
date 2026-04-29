/**
 * Quarterly roadmap refresh.
 *
 * Every 90 days (per CMU GEO research) we re-evaluate the client's
 * citation landscape against drift signals and ADD new roadmap items
 * for what's changed -- without nuking what's already in flight.
 *
 * Behavior:
 *   - DETECT drift via citation-drift.ts (90-day window comparison)
 *   - ADD new roadmap items for NEW competitors (compete with X),
 *     LOST citations (regain Y), and EMERGING gaps (claim Z)
 *   - DON'T touch existing items in_progress or done
 *   - DON'T touch existing pending items unless they reference an
 *     entity that's now demonstrably stale (no signal in 90 days)
 *   - WRITE last_refresh_at on client_settings so the cron knows when
 *     this client is next due
 *
 * The function is safe to call repeatedly. Internal dedup checks
 * prevent generating the same roadmap item twice.
 */

import type { Env } from "./types";
import { detectCitationDrift, type CitationDrift } from "./citation-drift";

export interface RefreshResult {
  ranAt: number;
  driftDetected: boolean;
  itemsAdded: number;
  itemsStaled: number;
  reason: string;
  drift: CitationDrift;
}

/** Run a full refresh for the given client. Returns a structured
 *  summary the cron + UI both consume. */
export async function runRoadmapRefresh(
  clientSlug: string,
  env: Env,
): Promise<RefreshResult> {
  const now = Math.floor(Date.now() / 1000);
  const drift = await detectCitationDrift(clientSlug, 90, env);

  if (!drift.hasEnoughData) {
    await markRefreshed(clientSlug, now, env);
    return {
      ranAt: now,
      driftDetected: false,
      itemsAdded: 0,
      itemsStaled: 0,
      reason: `Not enough citation data on either side of the 90-day window (before=${drift.beforeRuns}, after=${drift.afterRuns}). Need >=20 each.`,
      drift,
    };
  }

  if (!drift.driftDetected) {
    await markRefreshed(clientSlug, now, env);
    return {
      ranAt: now,
      driftDetected: false,
      itemsAdded: 0,
      itemsStaled: 0,
      reason: "Citation landscape is stable -- no new competitors, no lost citations, no emerging gaps in this window.",
      drift,
    };
  }

  // Build candidate roadmap items from the drift signals. We
  // dedupe against existing items by exact title match so reruns
  // are idempotent. Phase id is left null -- these are
  // non-phased, refresh-sourced items that show in the active
  // roadmap regardless of phase.
  let added = 0;

  // 1. New competitor items
  for (const c of drift.newCompetitors.slice(0, 5)) {
    const title = `Compete with ${c.name} on AI citations`;
    const exists = await titleExists(clientSlug, title, env);
    if (exists) continue;
    const desc = `${c.name} gained ${c.delta} new AI-engine citations in the last 90 days vs the previous window. Identify the queries they're winning and ship competing content.`;
    await insertItem(env, {
      clientSlug,
      title,
      description: desc,
      category: "competitor",
      now,
    });
    added++;
  }

  // 2. Lost citations -- HIGH priority (we used to win these and
  //    stopped). Group up to 5 keywords per item to avoid spam.
  if (drift.lostKeywords.length > 0) {
    const sample = drift.lostKeywords.slice(0, 5).map(k => `"${k.keyword}"`).join(", ");
    const title = `Regain citations on ${drift.lostKeywords.length} previously-cited queries`;
    const exists = await titleExists(clientSlug, title, env);
    if (!exists) {
      const desc = `You used to be cited for these queries but no longer are: ${sample}${drift.lostKeywords.length > 5 ? `, plus ${drift.lostKeywords.length - 5} more` : ""}. Audit which competitors took the spot and ship targeted content + schema updates.`;
      await insertItem(env, {
        clientSlug,
        title,
        description: desc,
        category: "regression",
        now,
      });
      added++;
    }
  }

  // 3. Emerging gaps -- MEDIUM priority (someone's getting cited
  //    on these and we never were). Cap at 1 grouped item.
  if (drift.emergingGaps.length > 0) {
    const sample = drift.emergingGaps.slice(0, 5).map(k => `"${k.keyword}"`).join(", ");
    const title = `Enter ${drift.emergingGaps.length} emerging-gap queries`;
    const exists = await titleExists(clientSlug, title, env);
    if (!exists) {
      const desc = `Competitors are getting cited on these queries and you aren't yet: ${sample}${drift.emergingGaps.length > 5 ? `, plus ${drift.emergingGaps.length - 5} more` : ""}. Ship cornerstone content for each.`;
      await insertItem(env, {
        clientSlug,
        title,
        description: desc,
        category: "content_gap",
        now,
      });
      added++;
    }
  }

  // No item-staling logic in v1 -- the data signal for "stale"
  // is too noisy and risks marking items stale that the customer
  // is actively working on. We can add it in a later pass when
  // we have more refresh cycles in the wild to learn from.

  await markRefreshed(clientSlug, now, env);

  return {
    ranAt: now,
    driftDetected: true,
    itemsAdded: added,
    itemsStaled: 0,
    reason: `Drift detected: ${drift.newCompetitors.length} new competitors, ${drift.lostKeywords.length} lost citations, ${drift.emergingGaps.length} emerging gaps. Added ${added} new roadmap items.`,
    drift,
  };
}

async function titleExists(clientSlug: string, title: string, env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM roadmap_items WHERE client_slug = ? AND title = ? LIMIT 1"
  ).bind(clientSlug, title).first<{ id: number }>();
  return !!row;
}

interface InsertParams {
  clientSlug: string;
  title: string;
  description: string;
  category: string;
  now: number;
}
async function insertItem(env: Env, p: InsertParams): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO roadmap_items (
       client_slug, phase_id, title, description, category, status,
       sort_order, refresh_source, stale, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, ?, 'pending', 1000, 'refresh', 0, ?, ?)`
  ).bind(p.clientSlug, p.title, p.description, p.category, p.now, p.now).run();
}

async function markRefreshed(clientSlug: string, now: number, env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO client_settings (client_slug, last_refresh_at, created_at, updated_at)
       VALUES (?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET
       last_refresh_at = excluded.last_refresh_at,
       updated_at = excluded.updated_at`
  ).bind(clientSlug, now, now, now).run();
}

/** Determine if a client is due for a refresh. True when:
 *    - last_refresh_at is null AND engagement >= 90 days old
 *    - OR last_refresh_at is >= 90 days old
 *  Used by the daily cron to identify candidates without running the
 *  expensive drift detection on every client every day. */
export async function isRefreshDue(clientSlug: string, env: Env): Promise<boolean> {
  const settings = await env.DB.prepare(
    "SELECT engagement_started_at, last_refresh_at FROM client_settings WHERE client_slug = ?"
  ).bind(clientSlug).first<{ engagement_started_at: number | null; last_refresh_at: number | null }>();

  if (!settings) return false;
  const now = Math.floor(Date.now() / 1000);
  const ninetyDays = 90 * 86400;

  if (settings.last_refresh_at) {
    return (now - settings.last_refresh_at) >= ninetyDays;
  }
  if (settings.engagement_started_at) {
    return (now - settings.engagement_started_at) >= ninetyDays;
  }
  return false;
}

/** Days until the next refresh fires (negative if overdue). */
export async function daysUntilRefresh(clientSlug: string, env: Env): Promise<number | null> {
  const settings = await env.DB.prepare(
    "SELECT engagement_started_at, last_refresh_at FROM client_settings WHERE client_slug = ?"
  ).bind(clientSlug).first<{ engagement_started_at: number | null; last_refresh_at: number | null }>();
  if (!settings) return null;
  const now = Math.floor(Date.now() / 1000);
  const ninetyDays = 90 * 86400;
  const anchor = settings.last_refresh_at ?? settings.engagement_started_at;
  if (!anchor) return null;
  return Math.ceil(((anchor + ninetyDays) - now) / 86400);
}

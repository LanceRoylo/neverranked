/**
 * Stuck-state detector.
 *
 * One module, one responsibility: ask "what's stuck in the system that
 * needs human attention right now?" across every long-running workflow
 * and return a unified list. Rendered as a widget on the admin cockpit
 * so the operator has a single surface to check each morning.
 *
 * Lives here (not inside each route's own queries) so we can extend
 * the set in one place and so aggregate counts are cheap for the
 * cockpit pulse.
 *
 * Categories detected:
 *   - qa_held_draft          content_drafts.qa_level='held' > 3 days old
 *   - stale_roadmap_item     roadmap_items.status='in_progress' > 14 days
 *   - scan_failure_streak    domain with 3+ consecutive scan errors
 *   - no_scan_no_login       domain active, no scan ever, client never logged in
 *   - drip_stall             lead without expected drip send beyond schedule
 *   - schema_draft_age       schema_injections.status='draft' > 5 days
 */

import type { Env } from "./types";

export type StuckItemKind =
  | "qa_held_draft"
  | "stale_roadmap_item"
  | "scan_failure_streak"
  | "no_scan_no_login"
  | "drip_stall"
  | "schema_draft_age";

export interface StuckItem {
  kind: StuckItemKind;
  /** Client or agency slug the item is scoped to (when applicable). */
  client_slug: string | null;
  /** Short human summary of the problem. Shown directly in the widget. */
  label: string;
  /** Where to go to resolve it. Relative URL. */
  href: string;
  /** Epoch seconds; how long it's been stuck. */
  since: number;
}

const DAY = 86400;

export async function detectStuckItems(env: Env): Promise<StuckItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const items: StuckItem[] = [];

  // 1. QA-held drafts older than 3 days -- ops should have cleared or
  //    rewritten them by now.
  const heldDrafts = (await env.DB.prepare(
    `SELECT id, client_slug, title, updated_at
       FROM content_drafts
       WHERE qa_level = 'held' AND updated_at < ?
       ORDER BY updated_at ASC LIMIT 50`,
  ).bind(now - 3 * DAY).all<{ id: number; client_slug: string; title: string; updated_at: number }>()).results;
  for (const d of heldDrafts) {
    items.push({
      kind: "qa_held_draft",
      client_slug: d.client_slug,
      label: `QA-held draft "${d.title.slice(0, 60)}" for ${d.client_slug}`,
      href: `/admin/content-review`,
      since: d.updated_at,
    });
  }

  // 2. Roadmap items that have been in_progress for 14+ days. Either
  //    the fix stalled or our auto-verify missed completion.
  const staleRoadmap = (await env.DB.prepare(
    `SELECT id, client_slug, title, updated_at
       FROM roadmap_items
       WHERE status = 'in_progress' AND updated_at < ?
       ORDER BY updated_at ASC LIMIT 50`,
  ).bind(now - 14 * DAY).all<{ id: number; client_slug: string; title: string; updated_at: number }>()).results;
  for (const r of staleRoadmap) {
    items.push({
      kind: "stale_roadmap_item",
      client_slug: r.client_slug,
      label: `Roadmap "${r.title.slice(0, 60)}" in-progress 14+ days`,
      href: `/roadmap/${r.client_slug}`,
      since: r.updated_at,
    });
  }

  // 3. Scan failure streaks. For each domain's 3 most recent scans, if
  //    all three have an error, we have a streak. Query all recent
  //    errors and let the JS group them.
  const recentErrors = (await env.DB.prepare(
    `SELECT sr.domain_id, sr.error, sr.scanned_at, d.domain, d.client_slug
       FROM scan_results sr
       JOIN domains d ON d.id = sr.domain_id
       WHERE sr.scanned_at > ?
         AND d.active = 1
       ORDER BY sr.domain_id, sr.scanned_at DESC`,
  ).bind(now - 30 * DAY).all<{ domain_id: number; error: string | null; scanned_at: number; domain: string; client_slug: string }>()).results;
  const perDomain = new Map<number, typeof recentErrors>();
  for (const row of recentErrors) {
    const arr = perDomain.get(row.domain_id) || [];
    if (arr.length < 3) arr.push(row); // already ordered desc
    perDomain.set(row.domain_id, arr);
  }
  for (const arr of perDomain.values()) {
    if (arr.length >= 3 && arr.every(r => r.error)) {
      items.push({
        kind: "scan_failure_streak",
        client_slug: arr[0].client_slug,
        label: `3+ scan failures on ${arr[0].domain} (${arr[0].error?.slice(0, 60) || "unknown"})`,
        href: `/admin/scans`,
        since: arr[0].scanned_at,
      });
    }
  }

  // 4. Domains that have never been scanned AND the client has never
  //    logged in. These are fully dormant onboardings that need a
  //    human to intervene (check snippet install, check welcome email).
  const dormant = (await env.DB.prepare(
    `SELECT d.id, d.domain, d.client_slug, d.created_at
       FROM domains d
       WHERE d.active = 1 AND d.is_competitor = 0
         AND d.created_at < ?
         AND NOT EXISTS (SELECT 1 FROM scan_results WHERE domain_id = d.id)
         AND NOT EXISTS (SELECT 1 FROM users WHERE client_slug = d.client_slug AND last_login_at IS NOT NULL)
       ORDER BY d.created_at ASC LIMIT 50`,
  ).bind(now - 2 * DAY).all<{ id: number; domain: string; client_slug: string; created_at: number }>()).results;
  for (const d of dormant) {
    items.push({
      kind: "no_scan_no_login",
      client_slug: d.client_slug,
      label: `${d.domain} added 2+ days ago -- no scan, no login`,
      href: `/admin/manage`,
      since: d.created_at,
    });
  }

  // 5. Schema injections stuck in draft >5 days. These were auto-
  //    generated to help a roadmap item; if no admin approved them
  //    they're dead weight.
  const schemaDrafts = (await env.DB.prepare(
    `SELECT id, client_slug, schema_type, created_at
       FROM schema_injections
       WHERE status = 'draft' AND created_at < ?
       ORDER BY created_at ASC LIMIT 50`,
  ).bind(now - 5 * DAY).all<{ id: number; client_slug: string; schema_type: string; created_at: number }>()).results;
  for (const s of schemaDrafts) {
    items.push({
      kind: "schema_draft_age",
      client_slug: s.client_slug,
      label: `Schema draft (${s.schema_type}) for ${s.client_slug} awaiting review 5+ days`,
      href: `/admin/manage`,
      since: s.created_at,
    });
  }

  // Sort oldest first so the most neglected items rise to the top.
  items.sort((a, b) => a.since - b.since);
  return items;
}

/**
 * Compact cockpit widget. Shown at the top of /admin alongside the
 * existing pulse. Limit 10 rows; counts roll up so the header still
 * reads accurately when more are hidden.
 */
export function renderStuckItemsWidget(items: StuckItem[]): string {
  if (items.length === 0) {
    return `
      <div class="card" style="border-color:var(--green);margin-bottom:20px">
        <div class="label" style="color:var(--green);margin-bottom:6px">Stuck items</div>
        <div style="font-size:13px;color:var(--text-soft)">Nothing is stuck. The automations are keeping up.</div>
      </div>
    `;
  }

  const topN = items.slice(0, 10);
  const more = items.length - topN.length;
  const now = Math.floor(Date.now() / 1000);
  const fmtAge = (since: number) => {
    const days = Math.max(1, Math.floor((now - since) / 86400));
    return `${days}d`;
  };
  const kindLabel: Record<StuckItemKind, string> = {
    qa_held_draft: "QA hold",
    stale_roadmap_item: "Stale roadmap",
    scan_failure_streak: "Scan streak",
    no_scan_no_login: "Dormant",
    drip_stall: "Drip stall",
    schema_draft_age: "Schema draft",
  };

  const rows = topN.map(it => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:12px">
      <span style="flex:0 0 110px;font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)">${kindLabel[it.kind]}</span>
      <span style="flex:1;color:var(--text);line-height:1.55">${it.label.replace(/</g, "&lt;")}</span>
      <span style="flex:0 0 40px;font-family:var(--mono);font-size:11px;color:var(--red);text-align:right">${fmtAge(it.since)}</span>
      <a href="${it.href}" style="flex:0 0 auto;font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);text-decoration:none;padding:4px 10px;border:1px solid var(--gold-dim);border-radius:2px">Resolve</a>
    </div>
  `).join("");

  return `
    <div class="card" style="border-color:var(--gold-dim);margin-bottom:20px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">
        <div class="label" style="color:var(--gold)">Stuck items (${items.length})</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">oldest first</div>
      </div>
      ${rows}
      ${more > 0 ? `<div style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--text-faint)">+ ${more} more not shown</div>` : ""}
    </div>
  `;
}

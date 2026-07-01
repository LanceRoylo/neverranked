/**
 * alert-triage.ts — one canonical place that answers, for any admin_alerts
 * `type`: is this a CONCERN (a human must act) or ACTIVITY (good news / FYI),
 * how big a concern (severity), and what the fix actually is.
 *
 * Pure function of the type string — no schema column, no backfill. It applies
 * instantly to every existing and future row and stays correct at all 15+
 * insert sites without threading a classification param through each.
 *
 * SAFETY DEFAULT: an unrecognized type is treated as needs-you (low), never
 * activity. A new concern type must never be silently buried in the FYI feed.
 *
 * Classifications come from the 2026-07-01 alert-taxonomy map (39 types).
 */

import type { Env } from "../types";

export type AlertLane = "needs_you" | "activity";
export type AlertSeverity = "high" | "medium" | "low";

export interface AlertTriage {
  lane: AlertLane;
  severity: AlertSeverity; // only meaningful for needs_you
  fixHint: string;         // remediation to seed a "copy fix request"; "" for activity
}

// CONCERN types → severity + the concrete fix. HIGH = data integrity, a
// customer-facing break, revenue, or infra down. MEDIUM = stalled / nudge /
// queue / recoverable drift.
const CONCERN: Record<string, { severity: AlertSeverity; fix: string }> = {
  backup_failure: { severity: "high", fix: "Weekly D1 backup to R2 failed. Check the backup logs; a manual R2 recovery may be needed." },
  gsc_token_dead: { severity: "high", fix: "GSC OAuth token refresh failed, breaking the auth chain. Re-authenticate GSC or check the service account." },
  htc_events_parser_drift: { severity: "high", fix: "The HTC events parser produced zero events from a non-empty page (selector drift). Inspect the Elementor card selectors and update parseEvents() in htc-events-cron.ts." },
  htc_events_db_failed: { severity: "high", fix: "A D1 read/write failed during the HTC events refresh (data-loss risk). Check D1 limits and batch syntax, then rerun the refresh." },
  snippet_drift: { severity: "high", fix: "A customer's NeverRanked snippet regressed (was detected, now missing). Likely removal or a site migration. High-touch follow-up with the agency." },
  config_drift_missing: { severity: "high", fix: "Client has domain rows but no injection_configs entry, so the snippet is a no-op. Run /admin/onboarding/heal/<slug> or insert the config row." },
  citation_lost: { severity: "high", fix: "Citations dropped to zero on a domain (was cited, now 0). Urgent: investigate the citation pipeline and rerun the scan." },
  automation_paused: { severity: "high", fix: "Automation is paused globally and a triggered action was rerouted here instead of running. Check the automation_settings pause reason and unpause after the fix." },
  agency_paused_payment: { severity: "high", fix: "An agency subscription payment failed (revenue risk). Check the Stripe invoice + payment method and contact the agency to update the card." },
  atlas_flag: { severity: "high", fix: "A customer flagged an Atlas answer for review. Read the flagged question and follow up." },
  anomaly_engine_empty_spike: { severity: "high", fix: "An engine's empty-response rate spiked above baseline (API key expired, model changed, or service degraded). Check /admin/qa and validate keys, model names, and endpoints." },
  anomaly_engine_row_drop: { severity: "high", fix: "An engine's row count fell below 50% of baseline (cron dispatch, rate limit, or API down). Check cron_runs for missed citations and engine connectivity." },
  anomaly_cron_overdue: { severity: "high", fix: "A cron task is more than 2x its expected cadence overdue (trigger misconfigured or worker errored mid-run). Check the Cloudflare scheduled triggers and worker logs." },

  htc_events_stale: { severity: "medium", fix: "HTC event data is older than 36h (silent cron-failure catch). Check /health/htc-events?dryrun=1." },
  htc_events_fetch_failed: { severity: "medium", fix: "The fetch from hawaiitheatre.com/upcoming-events/ failed. Test the URL and check the site's availability." },
  scan_streak: { severity: "medium", fix: "3+ consecutive scan failures on a domain. Check DNS, robots.txt, and bot-blocking; escalate to the agency." },
  roadmap_stall: { severity: "medium", fix: "Roadmap items have been in progress 14+ days. Nudge the agency to unblock, or mark them done." },
  stale_item: { severity: "medium", fix: "Roadmap items have been stale 14+ days. Escalate to the agency with the stalled titles." },
  snippet_stalled: { severity: "medium", fix: "A snippet is still not installed 30+ days after delivery (agency already nudged). Escalate to the agency account manager." },
  agency_app_stale: { severity: "medium", fix: "A partner application has been pending review 24h+. Approve or reject it in /admin/inbox." },
  content_queue_low: { severity: "medium", fix: "A content-enabled client has fewer than 2 planned items in the next 30 days. Add titles in /calendar/<slug> before the pipeline stalls." },
  trial_day30: { severity: "medium", fix: "A trial agency is 30+ days in and still unpaid. Send a conversion nudge before the day-60 deactivation." },
  trial_day14: { severity: "medium", fix: "A trial agency is 14+ days in and still unpaid. Send the first conversion nudge." },
  comp_expired: { severity: "medium", fix: "A complimentary subscription ended. Decide on conversion to paid or a graceful deactivation." },
  comp_expires_7d: { severity: "medium", fix: "A complimentary subscription expires in 7 days. Reach out for the conversion conversation." },
  needs_review: { severity: "medium", fix: "A roadmap item needs manual review (auto-verify could not handle it). Verify completion and mark it done or update the title." },
  slot_drift_detected: { severity: "medium", fix: "Signal/Amplify slot counts diverged between D1 and Stripe. The reconcile auto-retries; if it persists, compare Stripe subscription_items to agency_subscription_slots." },
};

// Dynamic-type prefixes (the stored type has an interpolated id/grade suffix).
// Each maps to a base classification. Order matters: longest/most-specific first.
const CONCERN_PREFIXES: Array<{ prefix: string; base: string }> = [
  { prefix: "agency_app_stale", base: "agency_app_stale" },
  { prefix: "trial_day30", base: "trial_day30" },
  { prefix: "trial_day14", base: "trial_day14" },
  { prefix: "comp_expires_7d", base: "comp_expires_7d" },
  { prefix: "comp_expired", base: "comp_expired" },
];

// ROUTINE prefixes that would otherwise get caught as unknown -> needs-you.
// These are explicitly good-news / FYI even with an id suffix.
const ACTIVITY_PREFIXES = ["comp_expires_30d", "trial_expired", "grade_reached"];

// Exact ROUTINE types (good news / FYI / routine ops). Everything the taxonomy
// marked ROUTINE. Anything not here and not a concern falls to the safe default.
const ACTIVITY_EXACT = new Set<string>([
  "deploy", "draft_ready", "cron_activated", "auto_completed", "snippet_detected",
  "memo_drafts_ready", "trial_expired", "comp_expires_30d", "roadmap_refreshed",
  "first_citation", "roadmap_completed", "score_change", "milestone",
  // internal routine ops that are not action items
  "cron", "audit_qa_run", "nap_audit", "agency_apply_submit", "agency_onboarding",
]);

export function classifyAlert(type: string): AlertTriage {
  const t = (type || "").trim();

  const exactConcern = CONCERN[t];
  if (exactConcern) return { lane: "needs_you", severity: exactConcern.severity, fixHint: exactConcern.fix };

  if (ACTIVITY_EXACT.has(t)) return { lane: "activity", severity: "low", fixHint: "" };

  for (const p of ACTIVITY_PREFIXES) {
    if (t.startsWith(p)) return { lane: "activity", severity: "low", fixHint: "" };
  }
  for (const { prefix, base } of CONCERN_PREFIXES) {
    if (t.startsWith(prefix)) {
      const c = CONCERN[base];
      return { lane: "needs_you", severity: c.severity, fixHint: c.fix };
    }
  }
  // htc_events_* not caught above is still a concern (medium) by prefix.
  if (t.startsWith("htc_events_")) {
    return { lane: "needs_you", severity: "medium", fixHint: "An HTC events refresh step failed. Check /health/htc-events?dryrun=1 and the htc-events-cron logs." };
  }

  // SAFETY DEFAULT: unrecognized type -> surface as low-priority needs-you,
  // never bury it in Activity. A new concern type shows up until classified.
  return { lane: "needs_you", severity: "low", fixHint: `Unclassified alert type "${t}". Classify it in dashboard/src/lib/alert-triage.ts and, if it is a concern, add its fix steps.` };
}

export function isConcernType(type: string): boolean {
  return classifyAlert(type).lane === "needs_you";
}

// Rank for sorting the Needs-you lane: high first, then medium, then low.
export function severityRank(s: AlertSeverity): number {
  return s === "high" ? 0 : s === "medium" ? 1 : 2;
}

// Count of UNREAD alerts that actually need a human (the honest badge number).
// Classification is code-level, so we fetch the unread types and filter here
// rather than in SQL. Scoped to a client when clientSlug is given, else global.
export async function countNeedsYouAlerts(env: Env, clientSlug?: string): Promise<number> {
  const rows = clientSlug
    ? (await env.DB.prepare("SELECT type FROM admin_alerts WHERE client_slug = ? AND read_at IS NULL").bind(clientSlug).all<{ type: string }>()).results
    : (await env.DB.prepare("SELECT type FROM admin_alerts WHERE read_at IS NULL").all<{ type: string }>()).results;
  return rows.filter((r) => isConcernType(r.type)).length;
}

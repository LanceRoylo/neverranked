/**
 * Dashboard -- Weekly cron scan runner + email digest
 *
 * Triggered every Monday at 6am UTC via Cloudflare Cron Trigger.
 * 1. Scans all active domains sequentially
 * 2. Sends digest emails to opted-in users with their domain results
 */

import type { Env, Domain, User, ScanResult, GscSnapshot } from "./types";
import { runContentPipeline, runContentOutcomeScan } from "./content-pipeline";
import { runScanStreakCheck, runRoadmapStallCheck } from "./safety-sweeps";
import { runRoadmapRefresh, isRefreshDue } from "./roadmap-refresh";
import { sendDigestEmail, sendRegressionAlert, REGRESSION_THRESHOLD, type DigestData, type GscDigestData, type RoadmapDigestData } from "./email";
import { sendOnboardingDripEmails } from "./onboarding-drip";
import { sendNurtureDripEmails } from "./nurture-drip";
import { getCitationDigestData, type CitationDigestData } from "./citations";
import { detectSnippet } from "./snippet-detector";
import { sendSnippetNudgeDay7, sendSnippetNudgeDay14, sendSnippetDay21Reframe, sendSnippetPauseCheckIn, sendSnippetDriftAlert, sendRoadmapStallNudge } from "./agency-emails";
import { getAgency, resolveAgencyForEmail } from "./agency";
import { createAlertIfFresh } from "./admin-alerts";
import { autoGenerateRoadmap } from "./auto-provision";
import { runAutomation, maybeSendAutomationDigest } from "./automation";

export async function runWeeklyScans(env: Env): Promise<void> {
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, domain"
  ).all<Domain>()).results;

  if (domains.length === 0) return;

  let dispatched = 0;
  let dispatchErrors = 0;

  // --- Phase 1: Dispatch a workflow instance per domain ---
  // Each domain runs in its own Worker invocation with its own
  // 1000-subrequest budget. Failures in one don't affect others, and
  // per-step retries are handled by the Workflows runtime.
  for (const d of domains) {
    try {
      await env.SCAN_DOMAIN_WORKFLOW.create({ params: { domainId: d.id } });
      dispatched++;
    } catch (e) {
      dispatchErrors++;
      console.log(`[cron] failed to dispatch scan workflow for domain ${d.id} (${d.domain}): ${e}`);
    }
  }

  console.log(`Weekly scan dispatched: ${dispatched} workflow instances queued, ${dispatchErrors} dispatch failures, ${domains.length} total`);

  // --- Phase 2: Dispatch the weekly-extras workflow ---
  // Citations + GSC + backup each get their own retryable step inside
  // one workflow invocation, isolated from the per-domain scans.
  try {
    await env.WEEKLY_EXTRAS_WORKFLOW.create({ params: {} });
    console.log(`[cron] dispatched weekly-extras workflow`);
  } catch (e) {
    console.log(`[cron] failed to dispatch weekly-extras workflow: ${e}`);
  }

  // --- Phase 3: Fan out one SendDigestWorkflow per opted-in user ---
  // Done here in the cron handler (not from inside WeeklyExtras)
  // because Cloudflare Workflows share subrequest budget across all
  // steps in one instance. Citations burns through ~1000 subreqs over
  // 3 minutes; dispatching from inside the same workflow afterwards
  // fails with "Too many subrequests" on the first .create() call.
  // The cron handler is a separate invocation, so per-user dispatches
  // here have a fresh budget. Verified working: instance 3edf55da.
  try {
    const users = (await env.DB.prepare(
      "SELECT id FROM users WHERE email_digest = 1"
    ).all<{ id: number }>()).results;
    let digestsDispatched = 0;
    for (const u of users) {
      try {
        await env.SEND_DIGEST_WORKFLOW.create({ params: { userId: u.id } });
        digestsDispatched++;
      } catch (e) {
        console.log(`[cron] failed to dispatch digest for user ${u.id}: ${e}`);
      }
    }
    console.log(`[cron] dispatched ${digestsDispatched}/${users.length} digest workflows`);
  } catch (e) {
    console.log(`[cron] failed to enumerate digest users: ${e}`);
  }
}

/** Send digest emails. If `usersOverride` is supplied, only those users
 *  are processed (used by SendDigestWorkflow to scope to one user per
 *  invocation, since per-user gather queries blow past the per-Worker
 *  subrequest cap when fanned out inline). With no override, all
 *  email_digest=1 users are loaded -- the legacy code path. */
export async function sendWeeklyDigests(
  domains: Domain[],
  env: Env,
  usersOverride?: User[]
): Promise<void> {
  const users = usersOverride ?? (await env.DB.prepare(
    "SELECT * FROM users WHERE email_digest = 1"
  ).all<User>()).results;

  if (users.length === 0) {
    console.log("No users opted in for digest emails");
    return;
  }

  // Build a map of client_slug -> primary domains (non-competitor)
  const clientDomains = new Map<string, Domain[]>();
  for (const d of domains) {
    if (d.is_competitor) continue;
    const arr = clientDomains.get(d.client_slug) || [];
    arr.push(d);
    clientDomains.set(d.client_slug, arr);
  }

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    // Admin sees all domains, clients see their own
    const userDomains = user.role === "admin"
      ? domains.filter(d => !d.is_competitor)
      : (user.client_slug ? clientDomains.get(user.client_slug) || [] : []);

    if (userDomains.length === 0) continue;

    // Gather scan data for each domain
    const digests: DigestData[] = [];
    for (const d of userDomains) {
      const recent = (await env.DB.prepare(
        "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
      ).bind(d.id).all<ScanResult>()).results;

      const latest = recent[0];
      const previous = recent[1] || null;

      if (latest && !latest.error) {
        digests.push({
          domain: d.domain,
          domainId: d.id,
          clientSlug: d.client_slug,
          latest,
          previous,
        });
      }
    }

    if (digests.length === 0) continue;

    // Gather citation data for each client_slug in the digest
    const citationDataMap = new Map<string, CitationDigestData>();
    const gscDataMap = new Map<string, GscDigestData>();
    const slugsSeen = new Set<string>();
    for (const d of digests) {
      if (slugsSeen.has(d.clientSlug)) continue;
      slugsSeen.add(d.clientSlug);
      const cData = await getCitationDigestData(d.clientSlug, env);
      if (cData) citationDataMap.set(d.clientSlug, cData);

      // Gather GSC data
      const gscSnaps = (await env.DB.prepare(
        "SELECT * FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 2"
      ).bind(d.clientSlug).all<GscSnapshot>()).results;
      if (gscSnaps.length > 0) {
        const latest = gscSnaps[0];
        const prev = gscSnaps[1] || null;
        let topQuery: string | null = null;
        try {
          const queries: { query: string; clicks: number }[] = JSON.parse(latest.top_queries);
          if (queries.length > 0) topQuery = queries[0].query;
        } catch {}
        gscDataMap.set(d.clientSlug, {
          clientSlug: d.clientSlug,
          clicks: latest.clicks,
          impressions: latest.impressions,
          ctr: latest.ctr,
          position: latest.position,
          prevClicks: prev ? prev.clicks : null,
          prevImpressions: prev ? prev.impressions : null,
          topQuery,
          dateRange: latest.date_start + " to " + latest.date_end,
        });
      }
    }

    // Gather roadmap data per client_slug
    const roadmapDataMap = new Map<string, RoadmapDigestData>();
    const rmSlugsSeen = new Set<string>();
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    for (const d of digests) {
      if (rmSlugsSeen.has(d.clientSlug)) continue;
      rmSlugsSeen.add(d.clientSlug);
      const total = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ?"
      ).bind(d.clientSlug).first<{ cnt: number }>();
      const done = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done'"
      ).bind(d.clientSlug).first<{ cnt: number }>();
      const inProg = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ? AND status = 'in_progress'"
      ).bind(d.clientSlug).first<{ cnt: number }>();
      const recentDone = (await env.DB.prepare(
        "SELECT title FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at > ? ORDER BY completed_at DESC LIMIT 3"
      ).bind(d.clientSlug, oneWeekAgo).all<{ title: string }>()).results;

      if (total && total.cnt > 0) {
        roadmapDataMap.set(d.clientSlug, {
          clientSlug: d.clientSlug,
          total: total.cnt,
          done: done?.cnt || 0,
          inProgress: inProg?.cnt || 0,
          recentlyCompleted: recentDone.map(r => r.title),
        });
      }
    }

    // Generate a simple unsub token (base64 of user id + email)
    const unsubToken = btoa(`${user.id}:${user.email}`).replace(/=/g, "");

    // White-label branding: agency for Mode-2 clients, null otherwise.
    const agency = await resolveAgencyForEmail(env, { email: user.email });

    const ok = await sendDigestEmail(user.email, user.name, digests, env, citationDataMap, gscDataMap, roadmapDataMap, unsubToken, agency);
    if (ok) {
      sent++;
      // Log to email_log
      try {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          "INSERT INTO email_log (email, type, created_at) VALUES (?, 'digest', ?)"
        ).bind(user.email, now).run();
      } catch {
        // Non-critical logging
      }
    } else {
      failed++;
    }

    // Small delay between emails to respect Resend rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Digest emails: ${sent} sent, ${failed} failed, ${users.length} eligible`);
}

/** Daily tasks: onboarding drip + nurture drip emails + stale roadmap check + snippet sweep + auto-provision missing roadmaps + automation digest */
export async function runDailyTasks(env: Env): Promise<void> {
  await sendOnboardingDripEmails(env);
  await sendNurtureDripEmails(env);
  await checkStaleRoadmapItems(env);
  await runSnippetSweep(env);
  await runMissingRoadmapSweep(env);

  // One-shot internal validation report for the Gemini grounding-redirect
  // resolver. Microsecond no-op until 2026-05-12, fires once, then no-op
  // forever via automation_log flag. Wrapped so a Resend failure never
  // breaks the daily cron. File is safe to delete after firing.
  try {
    const { maybeReportGeminiCoverage } = await import("./gemini-coverage-report");
    await maybeReportGeminiCoverage(env);
  } catch (e) {
    console.log(`[cron] gemini-coverage-report failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Per-client one-shot historical backfill of the Gemini grounding-
  // redirect resolver. Walks up to 3 unflagged active clients each
  // morning, resolves opaque vertexaisearch URLs in their
  // citation_runs.cited_urls, and re-runs reddit extraction. Per-client
  // automation_log flag prevents repeats. Microsecond no-op once every
  // active client is processed.
  try {
    const { maybeBackfillGeminiHistorical } = await import("./gemini-historical-backfill");
    await maybeBackfillGeminiHistorical(env);
  } catch (e) {
    console.log(`[cron] gemini-historical-backfill failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Hawaii Theatre Center: rescrape /upcoming-events/ and rewrite
  // Event schema rows. Cheap (one fetch + ~30 D1 writes) and event
  // turnover is fast enough that daily refresh is the right cadence.
  // Self-contained: a parser-drift safety check prevents wiping live
  // schemas if the upstream markup changes.
  // Roadmap reconciler: mark schema-category roadmap items done
  // when the corresponding schema_type is in approved
  // schema_injections. This is the structural fix for the
  // "we shipped it but the customer roadmap shows 0 progress"
  // gap -- the scanner can't see client-side-injected schemas, so
  // the reconciler reads from schema_injections (truth source)
  // and patches the customer view directly.
  try {
    const { reconcileAllRoadmaps } = await import("./roadmap-reconciler");
    const r = await reconcileAllRoadmaps(env);
    console.log(
      `[cron] roadmap-reconciler: scanned=${r.scanned} done=${r.markedDone} in_progress=${r.markedInProgress} ` +
      `byClient=${JSON.stringify(r.byClient)}`
    );
  } catch (e) {
    console.log(`[cron] roadmap-reconciler failed: ${e}`);
  }
  try {
    const { refreshHawaiiTheatreEvents } = await import("./htc-events-cron");
    const r = await refreshHawaiiTheatreEvents(env);
    console.log(
      `[cron] htc-events: parsed=${r.parsed} complete=${r.complete} ` +
      `added=${r.added} removed=${r.removed} unchanged=${r.unchanged}` +
      (r.error ? ` error=${r.error}` : "")
    );
  } catch (e) {
    console.log(`[cron] htc-events failed: ${e}`);
  }
  // Weekly drift sweep: only probes domains due (>7d since last check)
  // so running it daily is fine -- the query self-throttles.
  await runSchemaDriftSweep(env);
  // Quarterly roadmap refresh: per CMU GEO research, AEO strategies
  // need re-evaluation every 60-90 days as AI models retrain. The
  // sweep self-throttles (only runs the expensive drift detection
  // on clients past the 90-day threshold).
  await runQuarterlyRoadmapRefreshSweep(env);
  // Phase 6A: Recompute industry benchmark percentiles from latest
  // scan + citation_snapshot per tagged client. Industries with n<5
  // are skipped (their stale rows are deleted to avoid the dashboard
  // showing rollups computed against a smaller pool).
  try {
    const { recomputeIndustryBenchmarks } = await import("./industry-benchmarks");
    const r = await recomputeIndustryBenchmarks(env);
    console.log(`[cron] industry-benchmarks: ${r.industriesComputed} computed, ${r.industriesSkipped} skipped (n<5)`);
  } catch (e) {
    console.log(`[cron] industry-benchmarks failed: ${e}`);
  }

  // Onboarding drift check: any real client (slug exists in domains)
  // that does NOT have an injection_configs row. Caught us off guard
  // when hawaii-theatre installed the snippet on their site but our
  // backend was never activated, so their site loaded our JS for
  // weeks and got a 35-byte no-op back. The Stripe webhook now
  // auto-creates the config, the inject endpoint now lazy-creates
  // on first hit, but this drift check is the third belt-and-
  // suspenders layer in case both miss for any reason. Fires an
  // admin alert (one per affected slug per day max) so any drift is
  // visible in the inbox within 24 hours.
  try {
    const drift = (await env.DB.prepare(
      `SELECT DISTINCT d.client_slug FROM domains d
         LEFT JOIN injection_configs ic ON ic.client_slug = d.client_slug
         WHERE d.client_slug IS NOT NULL AND d.is_competitor = 0
           AND ic.client_slug IS NULL
           AND d.client_slug NOT LIKE '%-test-%'
           AND d.client_slug NOT LIKE 'e2e-%'`
    ).all<{ client_slug: string }>()).results;
    if (drift.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      for (const row of drift) {
        // De-dupe: skip if we already alerted on this slug in the last
        // 24h, so the cron doesn't spam every morning until ops fixes it.
        const recent = await env.DB.prepare(
          `SELECT id FROM admin_alerts
             WHERE client_slug = ? AND type = 'config_drift_missing'
               AND created_at > ?`
        ).bind(row.client_slug, now - 86400).first<{ id: number }>();
        if (recent) continue;
        await env.DB.prepare(
          `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
             VALUES (?, 'config_drift_missing', ?, ?, ?)`
        ).bind(
          row.client_slug,
          `Missing injection_configs row: ${row.client_slug}`,
          `Client "${row.client_slug}" has domain rows but no injection_configs entry. If they have the snippet on their site, it's currently returning the not-configured no-op. Run /admin/onboarding/heal/${row.client_slug} or insert the row manually. The Stripe webhook auto-creates configs; this drift means either the client was provisioned before that fix landed, or via a non-checkout path.`,
          now,
        ).run();
      }
      console.log(`[cron] onboarding drift: ${drift.length} client(s) missing injection_configs (alerts fired)`);
    }
  } catch (e) {
    console.log(`[cron] onboarding drift check failed: ${e}`);
  }
  // Monthly recap: only fires on day 1 of the month, self-guards
  // against re-fire via email_delivery_log.
  await maybeSendMonthlyRecaps(env);
  // Annual recap: only fires in early January, summarizes prior year.
  await maybeSendAnnualRecaps(env);
  // Expiring card check: warns customers 30 days before their card on
  // file expires. Self-guards via email_delivery_log so it only nags
  // each customer once per (card, month).
  await runExpiringCardCheck(env);
  // Recompute the score benchmark for the free check tool's "where
  // you fall" comparison. Median + grade distribution from real scans.
  await runBenchmarkCalc(env);
  // Dormancy check-in: paying user hasn't logged in in 21+ days. Send
  // a "what changed while you were away" email to re-engage.
  await runDormancyCheckIn(env);
  // Safety sweeps: the content-pipeline auto-pause pattern extended
  // to scans and roadmap. Each fires at most one admin_alert per
  // (client, type) per 7 days, so repeated failures don't spam.
  await runScanStreakCheck(env);
  await runRoadmapStallCheck(env);
  // Flag agency applications that have been pending for more than 24h
  // so they surface in /admin/inbox as a nudge to review.
  await runStaleAgencyAppCheck(env);
  // Flag content-enabled clients whose scheduled_drafts queue is running
  // dry so we know to refill titles before the pipeline stalls.
  await runLowQueueCheck(env);
  // Trial dormancy: nudge at day 14 and 30, deactivate at day 60.
  await runTrialDormancyCheck(env);
  // Comp'd subscription expiry warnings: fire fresh alerts at T-30,
  // T-7, and on the expiry date so they don't get buried in /admin/inbox.
  await runCompExpiryCheck(env);
  // Content pipeline: generate drafts for scheduled topics approaching
  // their ship date, auto-publish approved drafts whose scheduled date
  // has arrived (trust-window gated). Self-guards via scheduled_drafts
  // status so re-running is idempotent.
  await runContentPipeline(env);
  // Outcome scan: sweep recently-published content for earned
  // citations. Throttled per-item to every ~6 days.
  await runContentOutcomeScan(env);
  // Digest runs LAST so it includes anything the earlier sweeps wrote.
  // The digest function self-guards: opt-in flag, 18h dedupe, skip if
  // nothing to report.
  await maybeSendAutomationDigest(env);
}

// ---------------------------------------------------------------------------
// Stale agency-application nudge
// ---------------------------------------------------------------------------
//
// Partner applications land in agency_applications with status='pending'
// and an admin_alert fires immediately via /agency/apply. If the alert
// sits unreviewed for more than 24h this sweep drops a second alert to
// re-surface it in /admin/inbox. One alert per application via the type
// string -- re-running the sweep is idempotent.

export async function runStaleAgencyAppCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - 86400;

  const stale = (await env.DB.prepare(
    `SELECT id, agency_name, contact_name, contact_email, created_at
       FROM agency_applications
      WHERE status = 'pending' AND created_at < ?`
  ).bind(cutoff).all<{
    id: number; agency_name: string; contact_name: string;
    contact_email: string; created_at: number;
  }>()).results;

  if (stale.length === 0) return;

  for (const app of stale) {
    const hoursOld = Math.floor((now - app.created_at) / 3600);
    await createAlertIfFresh(env, {
      clientSlug: "_system",
      type: `agency_app_stale_${app.id}`,
      title: `Agency application pending ${hoursOld}h: ${app.agency_name}`,
      detail: `${app.contact_name} (${app.contact_email}) applied ${hoursOld}h ago and is still pending review in /admin/inbox.`,
      windowHours: 72, // one re-nudge every 3 days per application
    });
  }
  console.log(`[stale-app-check] reviewed ${stale.length} pending application(s)`);
}

// ---------------------------------------------------------------------------
// Low content queue check
// ---------------------------------------------------------------------------
//
// The content pipeline only ships what a human has queued in the calendar
// UI -- there is no auto-seeder. If a client's queue runs dry the pipeline
// quietly stops producing, which is easy to miss. This sweep flags any
// client that looks content-enabled (has shipped or queued anything in
// the last 60 days) but has fewer than 2 upcoming planned/drafted rows in
// the next 30 days. windowHours=168 caps noise to one alert per client
// per week.

export async function runLowQueueCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const sixtyDaysAgo = now - 60 * 86400;
  const thirtyDaysOut = now + 30 * 86400;
  const MIN_UPCOMING = 2;

  const lowClients = (await env.DB.prepare(
    `SELECT sd.client_slug AS slug,
            COUNT(CASE WHEN sd.status IN ('planned','drafted')
                        AND sd.scheduled_date BETWEEN ? AND ?
                       THEN 1 END) AS upcoming,
            MAX(sd.updated_at) AS last_activity
       FROM scheduled_drafts sd
       GROUP BY sd.client_slug
       HAVING last_activity >= ? AND upcoming < ?`
  ).bind(now, thirtyDaysOut, sixtyDaysAgo, MIN_UPCOMING).all<{
    slug: string; upcoming: number; last_activity: number;
  }>()).results;

  if (lowClients.length === 0) return;

  for (const row of lowClients) {
    await createAlertIfFresh(env, {
      clientSlug: row.slug,
      type: "content_queue_low",
      title: `Content queue low for ${row.slug}: ${row.upcoming} upcoming in next 30 days`,
      detail: `Add titles in /calendar/${row.slug} to keep the pipeline shipping. Threshold is ${MIN_UPCOMING} planned/drafted in the next 30 days.`,
      windowHours: 168,
    });
  }
  console.log(`[low-queue-check] flagged ${lowClients.length} client(s) with low content queue`);
}

// ---------------------------------------------------------------------------
// Trial dormancy
// ---------------------------------------------------------------------------
//
// Agencies that added a trial client but never activated billing get
// nudged at day 14 and day 30, then their trial client is deactivated
// (active=0, not deleted) at day 60. Each stage fires at most one
// admin_alert per agency via the type string so re-running is
// idempotent. Data is preserved for re-activation later.

export async function runTrialDormancyCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const day14 = now - 14 * 86400;
  const day30 = now - 30 * 86400;
  const day60 = now - 60 * 86400;

  // Pull all agencies with at least one trial=1, active=1 client and no
  // Stripe sub. Use MIN(domains.created_at) as the trial anchor -- if
  // they somehow have multiple trial rows, the oldest governs.
  const rows = (await env.DB.prepare(
    `SELECT a.id AS agency_id, a.slug, a.name, a.contact_email,
            MIN(d.created_at) AS trial_started_at
       FROM agencies a
       JOIN domains d ON d.agency_id = a.id AND d.trial = 1 AND d.active = 1
      WHERE a.stripe_subscription_id IS NULL
      GROUP BY a.id`
  ).all<{
    agency_id: number; slug: string; name: string;
    contact_email: string | null; trial_started_at: number;
  }>()).results;

  let nudged14 = 0, nudged30 = 0, expired = 0;

  for (const r of rows) {
    const age = r.trial_started_at;
    if (age < day60) {
      // Deactivate. Keep the data -- re-activation is just UPDATE
      // active=1 + trial=0 after they hit Stripe checkout.
      await env.DB.prepare(
        "UPDATE domains SET active = 0, updated_at = ? WHERE agency_id = ? AND trial = 1"
      ).bind(now, r.agency_id).run();
      await createAlertIfFresh(env, {
        clientSlug: "_system",
        type: `trial_expired_${r.agency_id}`,
        title: `Trial expired: ${r.name} (60d, no activation)`,
        detail: `Agency ${r.slug} started a trial 60+ days ago and never activated billing. Trial client deactivated. Data preserved -- restore with UPDATE domains SET active=1, trial=0 WHERE agency_id=${r.agency_id}.`,
        windowHours: 24 * 30,
      });
      expired++;
    } else if (age < day30) {
      await createAlertIfFresh(env, {
        clientSlug: "_system",
        type: `trial_day30_${r.agency_id}`,
        title: `Trial day 30: ${r.name}`,
        detail: `${r.name} (${r.contact_email || "no email"}) has had a trial client for 30+ days without activating. One more nudge, then day 60 deactivates.`,
        windowHours: 24 * 14,
      });
      nudged30++;
    } else if (age < day14) {
      await createAlertIfFresh(env, {
        clientSlug: "_system",
        type: `trial_day14_${r.agency_id}`,
        title: `Trial day 14: ${r.name}`,
        detail: `${r.name} (${r.contact_email || "no email"}) has had a trial client for 14+ days without activating.`,
        windowHours: 24 * 14,
      });
      nudged14++;
    }
  }

  if (rows.length > 0) {
    console.log(`[trial-dormancy] reviewed ${rows.length} trial agenc${rows.length === 1 ? "y" : "ies"}: day14=${nudged14} day30=${nudged30} expired=${expired}`);
  }
}

// ---------------------------------------------------------------------------
// Comp'd subscription expiry sweep
// ---------------------------------------------------------------------------
//
// Records inserted as admin_alerts.type='comp_expiry_marker' are the
// seed: they carry the expiry date embedded in the detail field as
// "expires_at=<unix_ts>". This sweep parses that ts and fires fresh
// alerts at T-30, T-7, and on/after the expiry date. Each stage
// dedupes via a unique type string so re-runs are idempotent and the
// alert resurfaces in /admin/inbox instead of staying buried under a
// months-old marker.

export async function runCompExpiryCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const markers = (await env.DB.prepare(
    "SELECT client_slug, detail FROM admin_alerts WHERE type = 'comp_expiry_marker'"
  ).all<{ client_slug: string; detail: string }>()).results;

  for (const m of markers) {
    const match = m.detail.match(/expires_at=(\d+)/);
    if (!match) continue;
    const expiryTs = Number(match[1]);
    if (!Number.isFinite(expiryTs)) continue;

    const daysUntil = Math.ceil((expiryTs - now) / 86400);

    if (daysUntil <= 0) {
      // On or past expiry day. One alert per marker; the 30d window
      // caps re-firing but keeps it visible if you miss the first one.
      await createAlertIfFresh(env, {
        clientSlug: m.client_slug,
        type: `comp_expired_${m.client_slug}`,
        title: `Comp subscription expired: ${m.client_slug}`,
        detail: `Complimentary plan ended ${Math.abs(daysUntil)} day(s) ago. Decide whether to convert to paid or deactivate. Marker detail: ${m.detail}`,
        windowHours: 24 * 30,
      });
    } else if (daysUntil <= 7) {
      await createAlertIfFresh(env, {
        clientSlug: m.client_slug,
        type: `comp_expires_7d_${m.client_slug}`,
        title: `Comp subscription expires in ${daysUntil} day(s): ${m.client_slug}`,
        detail: `Comp ends soon. Reach out to decide whether to continue. Marker detail: ${m.detail}`,
        windowHours: 24 * 7,
      });
    } else if (daysUntil <= 30) {
      await createAlertIfFresh(env, {
        clientSlug: m.client_slug,
        type: `comp_expires_30d_${m.client_slug}`,
        title: `Comp subscription expires in ${daysUntil} day(s): ${m.client_slug}`,
        detail: `Comp ends within 30 days. Good time to book a conversion conversation. Marker detail: ${m.detail}`,
        windowHours: 24 * 14,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Annual recap (calendar year in review)
// ---------------------------------------------------------------------------
//
// Fires in the first three days of January, summarizing the previous
// calendar year. Same email_delivery_log dedupe pattern as the monthly
// recap so a Jan 1 + Jan 2 double-firing won't duplicate.
//
// Why January 1st: clean calendar boundary that customers ALSO experience
// elsewhere (year in reviews from Spotify, banks, etc.) so the format is
// familiar. Reinforces that this is annual reflection, not just another
// monthly digest.

export async function maybeSendAnnualRecaps(env: Env): Promise<void> {
  const today = new Date();
  if (today.getUTCMonth() !== 0) return;            // January only
  if (today.getUTCDate() > 3) return;               // first 3 days only

  const now = Math.floor(Date.now() / 1000);
  const prevYear = today.getUTCFullYear() - 1;
  const yearLabel = String(prevYear);
  const yearStartTs = Math.floor(Date.UTC(prevYear, 0, 1) / 1000);
  const yearEndTs = Math.floor(Date.UTC(prevYear + 1, 0, 1) / 1000);
  const yearAgoCutoff = yearStartTs;

  const domains = (await env.DB.prepare(
    `SELECT * FROM domains WHERE active = 1 AND is_competitor = 0`
  ).all<Domain>()).results;
  if (domains.length === 0) return;

  const { resolveAgencyForEmail } = await import("./agency");
  const { sendAnnualRecapEmail } = await import("./email");

  let sent = 0;
  let skipped = 0;

  for (const d of domains) {
    try {
      // Score: latest scan AND ~1 year ago.
      const latest = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
      ).bind(d.id).first<{ aeo_score: number }>();
      const yearAgo = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at < ? ORDER BY scanned_at DESC LIMIT 1"
      ).bind(d.id, yearAgoCutoff).first<{ aeo_score: number }>();

      // Citation share: latest snapshot AND ~1 year ago.
      const csLatest = await env.DB.prepare(
        "SELECT citation_share FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1"
      ).bind(d.client_slug).first<{ citation_share: number }>();
      const csYearAgo = await env.DB.prepare(
        "SELECT citation_share FROM citation_snapshots WHERE client_slug = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1"
      ).bind(d.client_slug, yearAgoCutoff).first<{ citation_share: number }>();

      // Roadmap items completed in the previous year.
      const rmDone = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?"
      ).bind(d.client_slug, yearStartTs, yearEndTs).first<{ cnt: number }>();

      // Schema fixes shipped in the previous year.
      const fixes = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM schema_injections WHERE client_slug = ? AND status = 'approved' AND updated_at >= ? AND updated_at < ?"
      ).bind(d.client_slug, yearStartTs, yearEndTs).first<{ cnt: number }>();

      // Total scans in the year.
      const scanCount = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at >= ? AND scanned_at < ?"
      ).bind(d.id, yearStartTs, yearEndTs).first<{ cnt: number }>();

      // Best month: month with biggest score gain.
      const monthlyScans = (await env.DB.prepare(
        `SELECT scanned_at, aeo_score FROM scan_results
           WHERE domain_id = ? AND error IS NULL AND scanned_at >= ? AND scanned_at < ?
           ORDER BY scanned_at`
      ).bind(d.id, yearStartTs, yearEndTs).all<{ scanned_at: number; aeo_score: number }>()).results;
      let bestMonth: string | null = null;
      let bestMonthGain: number | null = null;
      if (monthlyScans.length > 1) {
        const byMonth = new Map<number, { first: number; last: number }>();
        for (const s of monthlyScans) {
          const m = new Date(s.scanned_at * 1000).getUTCMonth();
          const cur = byMonth.get(m);
          if (!cur) byMonth.set(m, { first: s.aeo_score, last: s.aeo_score });
          else cur.last = s.aeo_score;
        }
        let best = -Infinity;
        let bestM = -1;
        for (const [m, { first, last }] of byMonth) {
          const gain = last - first;
          if (gain > best) { best = gain; bestM = m; }
        }
        if (bestM >= 0 && best > 0) {
          bestMonth = new Date(Date.UTC(prevYear, bestM, 1)).toLocaleDateString("en-US", { month: "long" });
          bestMonthGain = best;
        }
      }

      // Skip clients with NO real signal (didn't have any scans in
      // the previous year). No point sending a "0/0" recap.
      if ((scanCount?.cnt || 0) === 0) { skipped++; continue; }

      const recipients = (await env.DB.prepare(
        `SELECT email, name FROM users
          WHERE email_digest = 1
            AND (role = 'admin' OR client_slug = ?)`
      ).bind(d.client_slug).all<{ email: string; name: string | null }>()).results;
      const agency = await resolveAgencyForEmail(env, { domainId: d.id });
      if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
        recipients.push({ email: agency.contact_email, name: null });
      }
      if (recipients.length === 0) { skipped++; continue; }

      const data = {
        domain: d.domain,
        clientSlug: d.client_slug,
        yearLabel,
        scoreNow: latest?.aeo_score ?? null,
        scoreYearAgo: yearAgo?.aeo_score ?? null,
        scoreDelta: latest && yearAgo ? latest.aeo_score - yearAgo.aeo_score : null,
        citationShareNow: csLatest?.citation_share ?? null,
        citationShareYearAgo: csYearAgo?.citation_share ?? null,
        roadmapCompleted: rmDone?.cnt || 0,
        schemaFixesShipped: fixes?.cnt || 0,
        bestMonth,
        bestMonthGain,
        totalScans: scanCount?.cnt || 0,
      };

      for (const r of recipients) {
        const recent = await env.DB.prepare(
          `SELECT id FROM email_delivery_log
            WHERE email = ? AND type = 'annual_recap' AND created_at > ?
            LIMIT 1`
        ).bind(r.email, now - 60 * 86400).first<{ id: number }>();
        if (recent) { skipped++; continue; }
        const ok = await sendAnnualRecapEmail(r.email, r.name, data, env, agency);
        if (ok) sent++;
        await new Promise((res) => setTimeout(res, 200));
      }
    } catch (e) {
      console.log(`[annual-recap] failed for ${d.client_slug}: ${e}`);
    }
  }

  console.log(`[annual-recap] ${sent} sent, ${skipped} skipped (no signal or already sent)`);
}

// ---------------------------------------------------------------------------
// Dormancy check-in (engagement-decline churn defense)
// ---------------------------------------------------------------------------
//
// Paying user (or agency_admin) hasn't logged in for 21-35 days. Send a
// friendly "here's what changed while you were away" email with a real
// recap (score delta, work shipped). The 21-35 window means we catch
// them at the inflection point before disengagement hardens into churn.
// Self-guards via email_delivery_log so each user gets at most one
// dormancy email per ~30-day window.

export async function runDormancyCheckIn(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // Paying users (or agency_admins) who logged in 21-35 days ago.
  // The window prevents us nagging brand-new users who haven't gotten
  // started yet AND prevents nagging users who already churned silently.
  const users = (await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.client_slug, u.last_login_at, u.agency_id
       FROM users u
      WHERE u.last_login_at IS NOT NULL
        AND u.last_login_at < ?
        AND u.last_login_at > ?
        AND (u.role = 'agency_admin'
             OR (u.role = 'client' AND u.plan IS NOT NULL AND u.plan != 'churned' AND u.plan != 'none'))`
  ).bind(now - 21 * DAY, now - 35 * DAY).all<{
    id: number; email: string; name: string | null; role: string;
    client_slug: string | null; last_login_at: number; agency_id: number | null;
  }>()).results;

  if (users.length === 0) return;

  const { resolveAgencyForEmail } = await import("./agency");
  const { sendDormancyCheckInEmail } = await import("./email");

  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    try {
      // Skip if we already sent a dormancy email in the last 30 days.
      const recent = await env.DB.prepare(
        "SELECT id FROM email_delivery_log WHERE email = ? AND type = 'dormancy_check_in' AND created_at > ? LIMIT 1"
      ).bind(u.email, now - 30 * DAY).first<{ id: number }>();
      if (recent) { skipped++; continue; }

      // Pick a domain to recap: their own client_slug for clients,
      // first active client for agency_admins.
      let domain;
      if (u.role === "client" && u.client_slug) {
        domain = await env.DB.prepare(
          "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
        ).bind(u.client_slug).first<Domain>();
      } else if (u.role === "agency_admin" && u.agency_id) {
        domain = await env.DB.prepare(
          "SELECT * FROM domains WHERE agency_id = ? AND is_competitor = 0 AND active = 1 ORDER BY created_at DESC LIMIT 1"
        ).bind(u.agency_id).first<Domain>();
      }
      if (!domain) { skipped++; continue; }

      // Score now vs. score at last login.
      const scoreNow = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
      ).bind(domain.id).first<{ aeo_score: number }>();
      const scoreThen = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at <= ? ORDER BY scanned_at DESC LIMIT 1"
      ).bind(domain.id, u.last_login_at).first<{ aeo_score: number }>();

      // Roadmap items completed since last login.
      const roadmapDone = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at > ?"
      ).bind(domain.client_slug, u.last_login_at).first<{ cnt: number }>();

      // Schema fixes pushed via injection since last login.
      const fixes = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM schema_injections WHERE client_slug = ? AND status = 'approved' AND updated_at > ?"
      ).bind(domain.client_slug, u.last_login_at).first<{ cnt: number }>();

      const daysSinceLogin = Math.floor((now - u.last_login_at) / DAY);
      const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

      const ok = await sendDormancyCheckInEmail(u.email, u.name, {
        domain: domain.domain,
        clientSlug: domain.client_slug,
        daysSinceLogin,
        scoreNow: scoreNow?.aeo_score ?? null,
        scoreThen: scoreThen?.aeo_score ?? null,
        roadmapDoneSinceLogin: roadmapDone?.cnt || 0,
        fixesShippedSinceLogin: fixes?.cnt || 0,
      }, env, agency);
      if (ok) sent++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.log(`[dormancy] failed for user ${u.id}: ${e}`);
      skipped++;
    }
  }

  console.log(`[dormancy] ${sent} sent, ${skipped} skipped (already sent or no signal)`);
}

// ---------------------------------------------------------------------------
// Score benchmark recompute (powers the free check tool comparison)
// ---------------------------------------------------------------------------
//
// The free check tool at check.neverranked.com shows a "Where you fall"
// section comparing the visitor's score to "AI-cited sites" + a grade
// distribution. Previously both were hardcoded fake numbers ("78%",
// "8/18/38/28/8"). This computes them from REAL scan_results so the
// comparison is honest. Stored in the shared LEADS KV so the
// schema-check Worker can read it without a D1 binding.
//
// Sample window: last 90 days, error IS NULL, primary domains only
// (not competitors -- those skew the distribution because they're
// often higher-quality sites by definition).
//
// Updated daily; LEADS KV TTL set generously so the check tool always
// has SOMETHING to render even if a recompute fails.

export async function runBenchmarkCalc(env: Env): Promise<void> {
  const LEADS = (env as { LEADS?: KVNamespace }).LEADS;
  if (!LEADS) return;

  const now = Math.floor(Date.now() / 1000);
  const ninetyDaysAgo = now - 90 * 86400;

  // Pull scores in one shot. At small scale this is cheap; at large
  // scale we'd subsample, but D1 row counts for our scan history
  // remain trivial for years.
  const scans = (await env.DB.prepare(
    `SELECT s.aeo_score, s.grade
       FROM scan_results s
       JOIN domains d ON d.id = s.domain_id
      WHERE s.error IS NULL
        AND s.scanned_at > ?
        AND d.is_competitor = 0`
  ).bind(ninetyDaysAgo).all<{ aeo_score: number; grade: string }>()).results;

  if (scans.length < 10) {
    // Not enough data to publish honest benchmarks. Don't overwrite
    // whatever's in KV; let it age until we have real signal.
    console.log(`[benchmark] only ${scans.length} eligible scans, skipping recompute`);
    return;
  }

  // Score percentiles.
  const scores = scans.map((s) => s.aeo_score).sort((a, b) => a - b);
  const pct = (p: number) => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))];

  // Grade distribution.
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scans) {
    if (gradeCounts[s.grade] !== undefined) gradeCounts[s.grade]++;
  }
  const gradeDist = (["A", "B", "C", "D", "F"] as const).map((g) => ({
    label: g,
    pct: Math.round((gradeCounts[g] / scans.length) * 100),
  }));

  const benchmark = {
    median: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
    gradeDistribution: gradeDist,
    sampleSize: scans.length,
    computedAt: now,
  };

  await LEADS.put("benchmark:aeo_score", JSON.stringify(benchmark), {
    // Long TTL is safe -- daily recompute keeps it fresh; if cron
    // fails for a week the data is just slightly stale.
    expirationTtl: 60 * 86400,
  });

  console.log(`[benchmark] recomputed from ${scans.length} scans: median=${benchmark.median}, p75=${benchmark.p75}`);
}

// ---------------------------------------------------------------------------
// Expiring card warning (30 days out)
// ---------------------------------------------------------------------------
//
// Stripe doesn't proactively notify customers their card is about to
// expire. Without this, the next renewal silently fails (we DO catch
// that via the payment_failed webhook, but at that point the customer
// is already mid-decline). 30 days of warning gives them time to
// update without urgency.
//
// Strategy: walk every user with a stripe_customer_id, ask Stripe for
// their default payment method, check the card expiry. If it expires
// within 30 days AND we haven't warned them in the last 25 days, fire.

export async function runExpiringCardCheck(env: Env): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return;

  const now = Math.floor(Date.now() / 1000);
  // Two attribution paths: direct customers (users.stripe_customer_id)
  // and agency subscriptions (agencies.stripe_customer_id). Walk both
  // and tag each entry with which kind so the email + portal link are
  // routed correctly.
  const userCustomers = (await env.DB.prepare(
    `SELECT id, email, name, stripe_customer_id FROM users
       WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id != ''`
  ).all<{ id: number; email: string; name: string | null; stripe_customer_id: string }>()).results;
  const agencyCustomers = (await env.DB.prepare(
    `SELECT id, contact_email AS email, name, stripe_customer_id FROM agencies
       WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id != ''
         AND contact_email IS NOT NULL`
  ).all<{ id: number; email: string; name: string; stripe_customer_id: string }>()).results;
  type CustomerEntry = {
    id: number; email: string; name: string | null;
    stripe_customer_id: string; isAgency: boolean;
  };
  const customers: CustomerEntry[] = [
    ...userCustomers.map((c) => ({ ...c, isAgency: false })),
    ...agencyCustomers.map((c) => ({ ...c, isAgency: true })),
  ];
  if (customers.length === 0) return;

  // 30 days from now: anything expiring before this date gets warned.
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 30);
  const cutoffMonth = cutoffDate.getUTCMonth() + 1; // 1-12
  const cutoffYear = cutoffDate.getUTCFullYear();

  let warned = 0;
  let skipped = 0;

  for (const c of customers) {
    try {
      // Fetch the customer to get the default payment method id.
      const custRes = await fetch(`https://api.stripe.com/v1/customers/${c.stripe_customer_id}`, {
        headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (!custRes.ok) { skipped++; continue; }
      const cust = await custRes.json() as { invoice_settings?: { default_payment_method?: string } };
      const pmId = cust.invoice_settings?.default_payment_method;
      if (!pmId) { skipped++; continue; }

      // Fetch the payment method to get the card expiry.
      const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
        headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (!pmRes.ok) { skipped++; continue; }
      const pm = await pmRes.json() as {
        card?: { exp_month: number; exp_year: number; last4: string };
      };
      if (!pm.card) { skipped++; continue; }

      const { exp_month, exp_year, last4 } = pm.card;
      // Card "expires at end of exp_month/exp_year." Compare to cutoff.
      const expiresBeforeCutoff =
        exp_year < cutoffYear ||
        (exp_year === cutoffYear && exp_month <= cutoffMonth);
      if (!expiresBeforeCutoff) { skipped++; continue; }

      // Already warned in the last 25 days? Skip.
      const recentWarn = await env.DB.prepare(
        `SELECT id FROM email_delivery_log
          WHERE email = ? AND type = 'card_expiring' AND created_at > ?
          LIMIT 1`
      ).bind(c.email, now - 25 * 86400).first<{ id: number }>();
      if (recentWarn) { skipped++; continue; }

      const { sendCardExpiringEmail } = await import("./email");
      const origin = env.DASHBOARD_ORIGIN || "https://app.neverranked.com";
      // Agency-scoped sends go to the agency-side billing portal AND
      // get branded as the agency. Direct sends go to the user portal.
      let agencyForBrand = null;
      let portalUrl = `${origin}/billing/portal`;
      if (c.isAgency) {
        const { getAgency } = await import("./agency");
        agencyForBrand = await getAgency(env, c.id);
        portalUrl = `${origin}/agency/billing`;
      }
      const ok = await sendCardExpiringEmail(c.email, c.name, {
        last4, expMonth: exp_month, expYear: exp_year,
        portalUrl,
      }, env, agencyForBrand);
      if (ok) warned++;

      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.log(`[expiring-card] failed for user ${c.id}: ${e}`);
      skipped++;
    }
  }

  console.log(`[expiring-card] checked ${customers.length}: ${warned} warned, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Monthly recap email
// ---------------------------------------------------------------------------
//
// Counters retention by manufacturing a regular "look how far you've
// come" moment that's separate from the weekly digest. Sent on the
// 1st of each month, summarizing the previous month: score change,
// citation share change, roadmap items completed, schema fixes
// shipped via the snippet. Forwardable to stakeholders.
//
// Self-guards via email_delivery_log: skip any (email, slug) pair we
// already sent a monthly_recap to in the last 25 days. Lets us safely
// run daily without duplicates and tolerates the cron firing on the
// 2nd if the 1st was missed for any reason.

export async function maybeSendMonthlyRecaps(env: Env): Promise<void> {
  const today = new Date();
  // Only run on day 1 (or day 2 as a forgiveness window for missed runs).
  if (today.getUTCDate() > 2) return;

  const now = Math.floor(Date.now() / 1000);
  const monthAgo = now - 30 * 86400;
  const sixtyDaysAgo = now - 60 * 86400;
  const monthLabel = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Active primary domains that have at least one scan.
  const domains = (await env.DB.prepare(
    `SELECT * FROM domains WHERE active = 1 AND is_competitor = 0`
  ).all<Domain>()).results;
  if (domains.length === 0) return;

  const { resolveAgencyForEmail } = await import("./agency");
  const { sendMonthlyRecapEmail } = await import("./email");

  let sent = 0;
  let skipped = 0;

  for (const d of domains) {
    try {
      // Score: latest scan AND scan from ~30 days ago.
      const latest = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
      ).bind(d.id).first<{ aeo_score: number }>();
      const prior = await env.DB.prepare(
        "SELECT aeo_score FROM scan_results WHERE domain_id = ? AND error IS NULL AND scanned_at < ? ORDER BY scanned_at DESC LIMIT 1"
      ).bind(d.id, monthAgo).first<{ aeo_score: number }>();

      // Citation share: latest snapshot AND prior snapshot ~30d ago.
      const csLatest = await env.DB.prepare(
        "SELECT citation_share FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1"
      ).bind(d.client_slug).first<{ citation_share: number }>();
      const csPrior = await env.DB.prepare(
        "SELECT citation_share FROM citation_snapshots WHERE client_slug = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1"
      ).bind(d.client_slug, monthAgo).first<{ citation_share: number }>();

      // Roadmap items completed in the last 30 days.
      const rmDone = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at > ?"
      ).bind(d.client_slug, monthAgo).first<{ cnt: number }>();

      // Schema fixes shipped via injection in the last 30 days.
      const fixes = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM schema_injections WHERE client_slug = ? AND status = 'approved' AND updated_at > ?"
      ).bind(d.client_slug, monthAgo).first<{ cnt: number }>();

      // If literally nothing happened (no scan, no roadmap done, no
      // fixes), skip the recap -- silence is better than a "0/0/0"
      // email that signals dead account.
      const hasSignal = (latest && latest.aeo_score !== null)
        || (rmDone && rmDone.cnt > 0)
        || (fixes && fixes.cnt > 0);
      if (!hasSignal) {
        skipped++;
        continue;
      }

      const recipients = (await env.DB.prepare(
        `SELECT email, name FROM users
          WHERE email_digest = 1
            AND (role = 'admin' OR client_slug = ?)`
      ).bind(d.client_slug).all<{ email: string; name: string | null }>()).results;
      const agency = await resolveAgencyForEmail(env, { domainId: d.id });
      if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
        recipients.push({ email: agency.contact_email, name: null });
      }
      if (recipients.length === 0) {
        skipped++;
        continue;
      }

      const data = {
        domain: d.domain,
        clientSlug: d.client_slug,
        monthLabel,
        scoreNow: latest?.aeo_score ?? null,
        scoreThen: prior?.aeo_score ?? null,
        scoreDelta: latest && prior ? latest.aeo_score - prior.aeo_score : null,
        citationShareNow: csLatest?.citation_share ?? null,
        citationShareThen: csPrior?.citation_share ?? null,
        citationsGainedThisMonth: 0,  // reserved for future expansion
        roadmapCompleted: rmDone?.cnt || 0,
        schemaFixesShipped: fixes?.cnt || 0,
        newCitationKeywordsCount: 0,
      };

      for (const r of recipients) {
        // Per-recipient guard: skip if we already sent this month
        // (within the last 25 days).
        const alreadySent = await env.DB.prepare(
          `SELECT id FROM email_delivery_log
            WHERE email = ? AND type = 'monthly_recap' AND created_at > ?
            LIMIT 1`
        ).bind(r.email, sixtyDaysAgo + 5 * 86400).first<{ id: number }>();
        if (alreadySent) {
          skipped++;
          continue;
        }
        const ok = await sendMonthlyRecapEmail(r.email, r.name, data, env, agency);
        if (ok) sent++;
        await new Promise((res) => setTimeout(res, 200));
      }
    } catch (e) {
      console.log(`[monthly-recap] failed for ${d.client_slug}: ${e}`);
    }
  }

  console.log(`[monthly-recap] ${sent} sent, ${skipped} skipped (already sent or no signal)`);
}

// ---------------------------------------------------------------------------
// Auto-provision missing roadmaps (Day 11 first automation rule)
// ---------------------------------------------------------------------------
//
// Bug we hit in testing: a client (neverranked.com itself) had a valid
// scan but zero roadmap items because it was added manually, bypassing
// the Stripe-checkout provision path that normally generates the
// initial roadmap. Finding this required a manual "Regenerate" click --
// the kind of thing the automation philosophy says the system should
// handle itself.
//
// This sweep runs daily and finds every active primary client that has
// at least one successful scan AND zero roadmap items. For each, it
// generates the roadmap via the existing autoGenerateRoadmap() path and
// logs the decision to automation_log. Idempotent: once the client has
// any items, the query filter excludes them and the sweep skips.
//
// Each decision goes through runAutomation() so the global pause switch
// controls it and every action leaves an audit row.

/**
 * Quarterly roadmap refresh sweep.
 *
 * Per CMU GEO research, AEO strategies need re-evaluation every 60-90
 * days as AI models retrain and competitor citation patterns shift.
 * For each active client past the 90-day threshold (since their last
 * refresh OR their engagement start), run drift detection and add
 * any new roadmap items the data justifies.
 *
 * Self-throttling: isRefreshDue() returns false for any client refreshed
 * less than 90 days ago, so this is safe to call daily.
 *
 * Logs every refresh to automation_log. Doesn't email -- the customer
 * sees the new items on their next /roadmap visit.
 */
export async function runQuarterlyRoadmapRefreshSweep(env: Env): Promise<void> {
  const clients = (await env.DB.prepare(
    `SELECT DISTINCT client_slug FROM domains WHERE active = 1 AND is_competitor = 0`
  ).all<{ client_slug: string }>()).results;

  let refreshed = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of clients) {
    try {
      const due = await isRefreshDue(c.client_slug, env);
      if (!due) { skipped++; continue; }

      const result = await runRoadmapRefresh(c.client_slug, env);
      refreshed++;

      // Audit row + admin alert when items were added so they show
      // up in the inbox.
      const now = Math.floor(Date.now() / 1000);
      try {
        await env.DB.prepare(
          `INSERT INTO automation_log (kind, target_type, target_slug, reason, detail, created_at)
           VALUES ('quarterly_roadmap_refresh', 'roadmap', ?, ?, ?, ?)`
        ).bind(
          c.client_slug,
          result.reason,
          JSON.stringify({ itemsAdded: result.itemsAdded, drift: result.drift }),
          now,
        ).run();
      } catch { /* non-fatal */ }

      if (result.itemsAdded > 0) {
        try {
          await env.DB.prepare(
            `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
             VALUES (?, 'roadmap_refreshed', ?, ?, ?)`
          ).bind(
            c.client_slug,
            `${result.itemsAdded} new roadmap item${result.itemsAdded === 1 ? "" : "s"} from quarterly refresh`,
            result.reason,
            now,
          ).run();
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      console.log(`[quarterly-refresh] failed for ${c.client_slug}: ${e}`);
      errors++;
    }
  }

  console.log(`[quarterly-refresh] sweep: ${refreshed} refreshed, ${skipped} not yet due, ${errors} errors`);
}

export async function runMissingRoadmapSweep(env: Env): Promise<void> {
  // Find active primary clients with >= 1 successful scan and 0 roadmap items.
  // We use the client_slug as the grouping key (matches the roadmap schema).
  const candidates = (await env.DB.prepare(`
    SELECT DISTINCT d.client_slug
      FROM domains d
     WHERE d.active = 1
       AND d.is_competitor = 0
       AND EXISTS (
         SELECT 1 FROM scan_results s
          WHERE s.domain_id = d.id AND s.error IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM roadmap_items r
          WHERE r.client_slug = d.client_slug
       )
  `).all<{ client_slug: string }>()).results;

  if (candidates.length === 0) return;

  let provisioned = 0;
  let skipped = 0;

  for (const { client_slug } of candidates) {
    const result = await runAutomation(env, {
      kind: "auto_roadmap_provision",
      targetType: "client",
      targetSlug: client_slug,
      reason: `Client ${client_slug} had scan data but zero roadmap items. Auto-provisioned the initial roadmap.`,
      pausedAlertTitle: `Automation paused: skipped roadmap provision for ${client_slug}`,
      action: async () => {
        await autoGenerateRoadmap(client_slug, env);
        return { client_slug };
      },
    });
    if (result) provisioned++;
    else skipped++;
  }

  console.log(
    `[missing-roadmap-sweep] ${candidates.length} candidate(s): ${provisioned} provisioned, ${skipped} skipped (paused)`
  );
}

// ---------------------------------------------------------------------------
// Snippet-not-detected sweep (Day 9 Part 2)
// ---------------------------------------------------------------------------
//
// Walks every active, agency-owned primary domain that has received
// the initial snippet delivery email, probes the homepage for our
// injector tag, and escalates through three tiers:
//
//   day 7  not detected  -> first nudge to the agency contact
//   day 14 not detected  -> second nudge (concierge offer)
//   day 30 not detected  -> admin_alerts row for ops to intervene
//
// Detection state is stamped on the domain row so we never re-nudge
// after a tier has already fired. If a snippet is detected for the
// first time, snippet_last_detected_at gets set and we stop probing
// (well, we still probe weekly to catch regressions, but we never
// send the "please install it" emails again).
//
// The checks run serially with small pauses so a batch of 20 domains
// doesn't hammer our own Workers edge or the targets' servers.

export async function runSnippetSweep(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // Candidates: active, primary (non-competitor), and either (a) snippet
  // has never been detected OR (b) it's been >= 24h since the last check.
  // We scan at most once per 24h per domain so repeated cron invocations
  // are idempotent.
  //
  // Originally this query gated on agency_id IS NOT NULL, which silently
  // excluded every direct (non-agency) client from snippet detection,
  // celebration emails, nudges, and drift alerts. Hawaii Theatre installed
  // their snippet, our backend was detected as silent, and no celebration
  // email ever fired -- because the cron didn't even consider them as
  // candidates. The agency_id filter was a coverage gap, not a feature.
  // Removed. Direct clients now go through the same lifecycle.
  //
  // We also relaxed the snippet_email_sent_at requirement -- some legacy
  // direct clients were onboarded before that column existed. If they
  // have a snippet detected in the wild, we should celebrate it.
  const yesterday = now - DAY;
  const candidates = (await env.DB.prepare(`
    SELECT * FROM domains
      WHERE active = 1
        AND is_competitor = 0
        AND (snippet_last_checked_at IS NULL OR snippet_last_checked_at < ?)
      ORDER BY COALESCE(snippet_email_sent_at, created_at)
      LIMIT 200
  `).bind(yesterday).all<Domain>()).results;

  if (candidates.length === 0) return;

  let detected = 0;
  let missing = 0;
  let nudgesSent = 0;
  let alertsCreated = 0;

  for (const d of candidates) {
    const agedAt = d.snippet_email_sent_at || d.activated_at || d.created_at || now;
    const daysSinceDelivery = Math.floor((now - agedAt) / DAY);

    const isDetected = await detectSnippet(d.domain);

    // Always stamp the check timestamp, and record detection if found.
    // First-time detection -> celebration email + admin alert (the
    // milestone the user has been working toward).
    const wasNeverDetectedBefore = !d.snippet_last_detected_at;
    try {
      if (isDetected) {
        await env.DB.prepare(
          "UPDATE domains SET snippet_last_checked_at = ?, snippet_last_detected_at = COALESCE(snippet_last_detected_at, ?) WHERE id = ?"
        ).bind(now, now, d.id).run();
        detected++;
        if (wasNeverDetectedBefore) {
          try {
            const { resolveAgencyForEmail } = await import("./agency");
            const { sendSnippetDetectedEmail } = await import("./email");
            const agencyForBrand = await resolveAgencyForEmail(env, { domainId: d.id });
            const recipients = (await env.DB.prepare(
              `SELECT email, name FROM users
                WHERE (role = 'client' AND client_slug = ?) OR role = 'admin'`
            ).bind(d.client_slug).all<{ email: string; name: string | null }>()).results;
            // Add the agency contact if this domain is agency-owned. Direct
            // clients (agency_id IS NULL) skip this whole block; the
            // agency_id! assertion was the second part of the gap that
            // would have crashed celebration for any direct client.
            if (d.agency_id) {
              const agencyRow = await getAgency(env, d.agency_id);
              if (agencyRow?.contact_email && !recipients.some((r) => r.email === agencyRow.contact_email)) {
                recipients.push({ email: agencyRow.contact_email, name: null });
              }
            }
            const daysSinceDelivery = d.snippet_email_sent_at
              ? Math.floor((now - d.snippet_email_sent_at) / 86400) : 0;
            for (const r of recipients) {
              await sendSnippetDetectedEmail(r.email, r.name, {
                domain: d.domain, clientSlug: d.client_slug, daysSinceDelivery,
              }, env, agencyForBrand);
              await new Promise((res) => setTimeout(res, 200));
            }
            await env.DB.prepare(
              "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'snippet_detected', ?, ?, ?)"
            ).bind(d.client_slug, `Snippet went live on ${d.domain}`, `${recipients.length} celebration emails sent. Took ${daysSinceDelivery} days from delivery.`, now).run();
          } catch (e) {
            console.log(`[snippet-sweep] celebration failed for ${d.id}: ${e}`);
          }
        }
      } else {
        await env.DB.prepare(
          "UPDATE domains SET snippet_last_checked_at = ? WHERE id = ?"
        ).bind(now, d.id).run();
        missing++;
      }
    } catch (e) {
      console.log(`[snippet-sweep] stamp failed for domain ${d.id}: ${e}`);
      continue;
    }

    // If it's detected now, we're done for this domain. No nudges ever
    // again even if it disappears later (snippet_last_detected_at stays
    // set). Regression tracking is a separate future feature.
    if (isDetected || d.snippet_last_detected_at) continue;

    // Tiered escalation. Each tier guards on its own timestamp column
    // so we never fire the same tier twice. Order is highest threshold
    // first because a domain crossing 90+ days could in theory be hitting
    // every guard for the first time on this scan; we want the most
    // important message to land. The lower-tier guards prevent re-fire.
    try {
      // Day 90+: pause check-in. Honest reset.
      if (daysSinceDelivery >= 90 && !d.snippet_pause_check_at) {
        const agency = await getAgency(env, d.agency_id!);
        if (agency) {
          const sent = await sendSnippetPauseCheckIn(env, { agency, domain: d, daysSinceDelivery });
          if (sent) {
            await env.DB.prepare(
              "UPDATE domains SET snippet_pause_check_at = ? WHERE id = ?"
            ).bind(now, d.id).run();
            nudgesSent++;
          }
        }
      }
      if (daysSinceDelivery >= 30) {
        // Day 30+: escalate to admin. Only insert if we haven't
        // already alerted for this domain in the last 30 days.
        const existing = await env.DB.prepare(
          "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = 'snippet_stalled' AND created_at > ? LIMIT 1"
        ).bind(d.client_slug, now - 30 * DAY).first<{ id: number }>();
        if (!existing) {
          await env.DB.prepare(
            "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'snippet_stalled', ?, ?, ?)"
          ).bind(
            d.client_slug,
            `Snippet still not installed on ${d.domain} after ${daysSinceDelivery} days`,
            `Agency has been nudged twice + day-21 reframed. Manual intervention likely needed. Domain id ${d.id}, agency id ${d.agency_id}.`,
            now,
          ).run();
          alertsCreated++;
        }
      }
      // Day 21: reframe email. Different angle from the install nudges.
      if (daysSinceDelivery >= 21 && !d.snippet_nudge_day21_at) {
        const agency = await getAgency(env, d.agency_id!);
        if (agency) {
          // Count pending roadmap items so the reframe can name a specific
          // number ("the 12 schema items in the roadmap that we'd push").
          const pending = await env.DB.prepare(
            "SELECT COUNT(*) AS cnt FROM roadmap_items WHERE client_slug = ? AND category = 'schema' AND status != 'done'"
          ).bind(d.client_slug).first<{ cnt: number }>();
          const sent = await sendSnippetDay21Reframe(env, {
            agency, domain: d, daysSinceDelivery,
            pendingRoadmapCount: pending?.cnt || 0,
          });
          if (sent) {
            await env.DB.prepare(
              "UPDATE domains SET snippet_nudge_day21_at = ? WHERE id = ?"
            ).bind(now, d.id).run();
            nudgesSent++;
          }
        }
      }
      if (daysSinceDelivery >= 14 && !d.snippet_nudge_day14_at) {
        const agency = await getAgency(env, d.agency_id!);
        if (agency) {
          const sent = await sendSnippetNudgeDay14(env, { agency, domain: d, daysSinceDelivery });
          if (sent) {
            await env.DB.prepare(
              "UPDATE domains SET snippet_nudge_day14_at = ? WHERE id = ?"
            ).bind(now, d.id).run();
            nudgesSent++;
          }
        }
      }
      if (daysSinceDelivery >= 7 && !d.snippet_nudge_day7_at) {
        const agency = await getAgency(env, d.agency_id!);
        if (agency) {
          const sent = await sendSnippetNudgeDay7(env, { agency, domain: d, daysSinceDelivery });
          if (sent) {
            await env.DB.prepare(
              "UPDATE domains SET snippet_nudge_day7_at = ? WHERE id = ?"
            ).bind(now, d.id).run();
            nudgesSent++;
          }
        }
      }
    } catch (e) {
      console.log(`[snippet-sweep] nudge failed for domain ${d.id}: ${e}`);
    }

    // Courtesy pause between fetches so we're not hammering anyone.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `[snippet-sweep] checked ${candidates.length} domain(s): ` +
    `${detected} detected, ${missing} missing, ${nudgesSent} nudge(s) sent, ${alertsCreated} admin alert(s)`
  );
}

// ---------------------------------------------------------------------------
// Schema drift detection (M)
// ---------------------------------------------------------------------------
//
// Pairs with the Day 9 snippet sweep. The sweep handles "snippet was
// never installed" — this handles "snippet WAS installed but has now
// disappeared" (webmaster deleted the tag, template regenerated, CDN
// rewrote it out, CMS migration). Runs weekly (no need for daily since
// drift is rare and we don't want to hammer client sites unnecessarily).
//
// Candidate: active agency-owned primary domain with snippet_last_detected_at
// set AND last drift check older than 7 days. If the probe now returns
// "not detected," that's drift — email the agency + create admin alert.
//
// We reuse snippet_last_checked_at as the "last drift check" timestamp.
// This is the same column the install-sweep uses, so both operations
// respect each other's probe cadence.

export async function runSchemaDriftSweep(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  const sevenDaysAgo = now - 7 * DAY;

  const candidates = (await env.DB.prepare(`
    SELECT * FROM domains
      WHERE agency_id IS NOT NULL
        AND active = 1
        AND is_competitor = 0
        AND snippet_last_detected_at IS NOT NULL
        AND (snippet_last_checked_at IS NULL OR snippet_last_checked_at < ?)
      ORDER BY snippet_last_checked_at NULLS FIRST
      LIMIT 100
  `).bind(sevenDaysAgo).all<Domain>()).results;

  if (candidates.length === 0) return;

  let stillLive = 0;
  let drifted = 0;

  for (const d of candidates) {
    const isDetected = await detectSnippet(d.domain);

    try {
      await env.DB.prepare(
        "UPDATE domains SET snippet_last_checked_at = ? WHERE id = ?"
      ).bind(now, d.id).run();
    } catch (e) {
      console.log(`[drift-sweep] stamp failed for ${d.id}: ${e}`);
      continue;
    }

    if (isDetected) {
      stillLive++;
      continue;
    }

    // Drift. Notify the agency + admin alert. Dedup at 7 days so we
    // don't spam an agency whose client is actively sorting it out.
    drifted++;
    try {
      const agency = await getAgency(env, d.agency_id!);
      if (agency) {
        await sendSnippetDriftAlert(env, { agency, domain: d });
      }
    } catch (e) {
      console.log(`[drift-sweep] email failed for ${d.id}: ${e}`);
    }
    await createAlertIfFresh(env, {
      clientSlug: d.client_slug,
      type: "snippet_drift",
      title: `Snippet disappeared from ${d.domain}`,
      detail: `Was previously live (first detected ${d.snippet_last_detected_at ? new Date(d.snippet_last_detected_at * 1000).toISOString().slice(0, 10) : "unknown"}). Agency has been notified by email.`,
      windowHours: 24 * 7,
    });

    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `[drift-sweep] checked ${candidates.length} previously-live domain(s): ${stillLive} still live, ${drifted} drifted`
  );
}

/** Flag roadmap items stuck in "in_progress" for 14+ days */
async function checkStaleRoadmapItems(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const fourteenDaysAgo = now - 14 * 86400;

  // Find stale items grouped by client, excluding clients already flagged in the last 14 days
  const staleItems = (await env.DB.prepare(`
    SELECT ri.id, ri.client_slug, ri.title, ri.updated_at
    FROM roadmap_items ri
    WHERE ri.status = 'in_progress'
      AND ri.updated_at < ?
  `).bind(fourteenDaysAgo).all<{
    id: number;
    client_slug: string;
    title: string;
    updated_at: number;
  }>()).results;

  if (staleItems.length === 0) return;

  // Group by client_slug
  const byClient = new Map<string, typeof staleItems>();
  for (const item of staleItems) {
    const arr = byClient.get(item.client_slug) || [];
    arr.push(item);
    byClient.set(item.client_slug, arr);
  }

  // Check which clients were already flagged recently (avoid spamming)
  const recentlyFlagged = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM admin_alerts WHERE type = 'stale_item' AND created_at > ?"
  ).bind(fourteenDaysAgo).all<{ client_slug: string }>()).results;
  const flaggedSlugs = new Set(recentlyFlagged.map(r => r.client_slug));

  let flagged = 0;
  let agencyNudged = 0;
  for (const [slug, items] of byClient) {
    if (flaggedSlugs.has(slug)) continue; // Already alerted recently

    const titles = items.map(i => i.title).slice(0, 5).join(", ");
    const daysStale = Math.floor((now - Math.min(...items.map(i => i.updated_at))) / 86400);
    try {
      await env.DB.prepare(
        "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'stale_item', ?, ?, ?)"
      ).bind(
        slug,
        `${items.length} roadmap item${items.length > 1 ? 's' : ''} stale for ${daysStale}+ days`,
        titles,
        now
      ).run();
      flagged++;
    } catch (e) {
      console.log(`Failed to create stale alert for ${slug}: ${e}`);
    }

    // L: if the client belongs to an agency, loop the agency in too.
    // The admin alert still fires for our visibility, but the agency
    // is the right party to actually unblock client-side work.
    try {
      const primary = await env.DB.prepare(
        "SELECT agency_id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 AND agency_id IS NOT NULL LIMIT 1"
      ).bind(slug).first<{ agency_id: number }>();
      if (primary?.agency_id) {
        const agency = await getAgency(env, primary.agency_id);
        if (agency) {
          await sendRoadmapStallNudge(env, {
            agency,
            clientSlug: slug,
            stalledCount: items.length,
            daysStale,
            sampleTitles: items.map(i => i.title),
          });
          agencyNudged++;
        }
      }
    } catch (e) {
      console.log(`[stale-roadmap] agency nudge failed for ${slug}: ${e}`);
    }
  }

  if (flagged > 0) console.log(`Stale roadmap check: flagged ${flagged} client(s), nudged ${agencyNudged} agency contact(s)`);
}

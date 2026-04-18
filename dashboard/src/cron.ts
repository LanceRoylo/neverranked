/**
 * Dashboard -- Weekly cron scan runner + email digest
 *
 * Triggered every Monday at 6am UTC via Cloudflare Cron Trigger.
 * 1. Scans all active domains sequentially
 * 2. Sends digest emails to opted-in users with their domain results
 */

import type { Env, Domain, User, ScanResult, GscSnapshot } from "./types";
import { scanDomain } from "./scanner";
import { scanDomainPages } from "./pages";
import { sendDigestEmail, sendRegressionAlert, REGRESSION_THRESHOLD, type DigestData, type GscDigestData, type RoadmapDigestData } from "./email";
import { checkAndAlertRegression } from "./regression";
import { autoCompleteRoadmapItems } from "./auto-complete";
import { sendOnboardingDripEmails } from "./onboarding-drip";
import { sendNurtureDripEmails } from "./nurture-drip";
import { runWeeklyCitations, getCitationDigestData, type CitationDigestData } from "./citations";
import { pullGscData } from "./gsc";
import { detectSnippet } from "./snippet-detector";
import { sendSnippetNudgeDay7, sendSnippetNudgeDay14, sendSnippetDay21Reframe, sendSnippetPauseCheckIn, sendSnippetDriftAlert, sendRoadmapStallNudge } from "./agency-emails";
import { getAgency, resolveAgencyForEmail } from "./agency";
import { createAlertIfFresh } from "./admin-alerts";
import { autoGenerateRoadmap } from "./auto-provision";
import { runAutomation, maybeSendAutomationDigest } from "./automation";
import { runWeeklyBackup } from "./backup";

export async function runWeeklyScans(env: Env): Promise<void> {
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, domain"
  ).all<Domain>()).results;

  if (domains.length === 0) return;

  let scanned = 0;
  let errors = 0;

  // --- Phase 1: Run all scans ---

  for (const d of domains) {
    try {
      const url = `https://${d.domain}/`;
      const result = await scanDomain(d.id, url, "cron", env);
      if (result?.error) {
        errors++;
      } else {
        scanned++;
        // Auto-complete roadmap items based on scan improvements
        if (result && !d.is_competitor) {
          try {
            await autoCompleteRoadmapItems(d.client_slug, result, env);
          } catch (e) {
            console.log(`Auto-complete failed for ${d.client_slug}: ${e}`);
          }
        }
      }
      // Also scan individual pages for schema coverage
      await scanDomainPages(d.id, d.domain, env);

      // Check for score regression and alert if needed
      await checkAndAlertRegression(d, env);
    } catch {
      errors++;
    }

    // Small delay between scans to be respectful
    if (d !== domains[domains.length - 1]) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`Weekly scan complete: ${scanned} succeeded, ${errors} failed, ${domains.length} total`);

  // --- Phase 2: Run citation tracking ---

  await runWeeklyCitations(env);

  // --- Phase 2b: Pull Google Search Console data ---

  await pullGscData(env);

  // --- Phase 3: Send digest emails ---

  await sendWeeklyDigests(domains, env);

  // --- Phase 4: Snapshot D1 to R2 for offline-restorable backup ---
  // Runs after digests so any state changes from the run are captured.
  // Self-contained: errors are logged + alerted, never fail the cron.
  try {
    await runWeeklyBackup(env);
  } catch (e) {
    console.log(`[cron] runWeeklyBackup threw: ${e}`);
  }
}

/** Send digest emails to all opted-in users */
async function sendWeeklyDigests(domains: Domain[], env: Env): Promise<void> {
  // Get all users who have digests enabled
  const users = (await env.DB.prepare(
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
  // Weekly drift sweep: only probes domains due (>7d since last check)
  // so running it daily is fine -- the query self-throttles.
  await runSchemaDriftSweep(env);
  // Monthly recap: only fires on day 1 of the month, self-guards
  // against re-fire via email_delivery_log.
  await maybeSendMonthlyRecaps(env);
  // Digest runs LAST so it includes anything the earlier sweeps wrote.
  // The digest function self-guards: opt-in flag, 18h dedupe, skip if
  // nothing to report.
  await maybeSendAutomationDigest(env);
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

  // Candidates: agency-owned, active, primary (non-competitor), snippet
  // delivery email has been sent, and either (a) snippet has never been
  // detected OR (b) it's been >= 24h since the last check. We scan at
  // most once per 24h per domain so repeated cron invocations are
  // still-idempotent.
  const yesterday = now - DAY;
  const candidates = (await env.DB.prepare(`
    SELECT * FROM domains
      WHERE agency_id IS NOT NULL
        AND active = 1
        AND is_competitor = 0
        AND snippet_email_sent_at IS NOT NULL
        AND (snippet_last_checked_at IS NULL OR snippet_last_checked_at < ?)
      ORDER BY snippet_email_sent_at
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
    try {
      if (isDetected) {
        await env.DB.prepare(
          "UPDATE domains SET snippet_last_checked_at = ?, snippet_last_detected_at = COALESCE(snippet_last_detected_at, ?) WHERE id = ?"
        ).bind(now, now, d.id).run();
        detected++;
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

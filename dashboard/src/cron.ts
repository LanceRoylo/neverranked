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
import { sendOnboardingDripEmails } from "./onboarding-drip";
import { sendNurtureDripEmails } from "./nurture-drip";
import { runWeeklyCitations, getCitationDigestData, type CitationDigestData } from "./citations";
import { pullGscData } from "./gsc";

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
      }
      // Also scan individual pages for schema coverage
      await scanDomainPages(d.id, d.domain, env);

      // Check for score regression and alert if needed
      await checkAndAlertRegression(d, env);
    } catch {
      errors++;
    }

    // Small delay between scans to be respectful
    if (domains.indexOf(d) < domains.length - 1) {
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

    const ok = await sendDigestEmail(user.email, user.name, digests, env, citationDataMap, gscDataMap, roadmapDataMap, unsubToken);
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

/** Daily tasks: onboarding drip + nurture drip emails */
export async function runDailyTasks(env: Env): Promise<void> {
  await sendOnboardingDripEmails(env);
  await sendNurtureDripEmails(env);
}

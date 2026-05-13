/**
 * WeeklyExtrasWorkflow -- aggregation pass. Runs after the per-keyword
 * CitationKeywordWorkflow instances have written their rows.
 *
 * Architecture (2026-05-10):
 *   - Per-keyword citation runs: dispatched as separate
 *     CitationKeywordWorkflow instances (one per (client, keyword))
 *     by cron / manual button. NOT done in this workflow anymore.
 *     Each per-keyword instance gets its own 1000-subrequest budget,
 *     which is the only way the cron path actually completes 15+
 *     keywords reliably.
 *   - Snapshot per client -- only when params.runSnapshot is true.
 *     Reads the prior `snapshotLookbackDays` of citation_runs rows.
 *     Daily cron passes runSnapshot=true with lookback=7 on Mondays.
 *     Manual button passes runSnapshot=true with lookback=1 (today
 *     only) for fresh user feedback.
 *   - GSC + backup -- only when runGscAndBackup is true. Mondays only.
 *
 * History:
 *   2026-05-09: refactored citations from a single step to per-keyword
 *     fan-out as steps within one workflow. Hit the shared 1000-
 *     subrequest budget after ~2 keywords; remaining steps "succeeded"
 *     with 0 rows.
 *   2026-05-10: pulled per-keyword work out entirely. Each keyword
 *     now runs as its own CitationKeywordWorkflow instance with its
 *     own subrequest budget.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../types";
import {
  planCitationRun,
  buildClientSnapshot,
} from "../citations";
import { pullGscData } from "../gsc";
import { runWeeklyBackup } from "../backup";
import { sendPendingDigests } from "../lib/citation-alerts";

export type WeeklyExtrasParams = {
  // When present, runs the snapshot/alerts work for just that client_slug.
  // Used by the admin "Run citation scan now" button.
  slugFilter?: string;
  // When true, runs per-client snapshot rollup. Daily cron sets true
  // on Mondays only; manual button always sets true (with lookback=1
  // for fresh feedback).
  runSnapshot?: boolean;
  // Days of citation_runs history to roll into the snapshot. 7 for
  // Monday weekly rollup, 1 for manual same-day verification.
  snapshotLookbackDays?: number;
  // When true, runs GSC pull + weekly backup. Mondays only via cron.
  // Manual button leaves false -- it's citations-only verification.
  runGscAndBackup?: boolean;
};

export class WeeklyExtrasWorkflow extends WorkflowEntrypoint<Env, WeeklyExtrasParams> {
  async run(event: WorkflowEvent<WeeklyExtrasParams>, step: WorkflowStep): Promise<void> {
    const slugFilter = event.payload?.slugFilter;
    const runSnapshot = event.payload?.runSnapshot ?? false;
    const snapshotLookbackDays = event.payload?.snapshotLookbackDays ?? 7;
    const runGscAndBackup = event.payload?.runGscAndBackup ?? false;

    // Plan: list out which clients we're snapshotting.
    const plan = await step.do("plan", async () => {
      return await planCitationRun(this.env, slugFilter);
    });

    // Snapshot per client. Conditional -- only Mondays via cron, or
    // when manual button explicitly requests fresh same-day data.
    //
    // 2026-05-11: added step.sleep before snapshot to solve the race
    // condition between this workflow and the per-keyword
    // CitationKeywordWorkflow instances dispatched in parallel from
    // cron. Verified empirically the Monday cron at 06:00 UTC: the
    // snapshot used to run at 06:25 UTC while per-keyword workflows
    // continued landing rows until 11:50 UTC (5+ hours later). The
    // snapshot at 06:25 missed all Gemma rows + most engine rows.
    //
    // Sleep duration:
    //   - Cron path: 5 minutes is enough; per-keyword workflows
    //     complete in 30-90s each and Cloudflare runs many concurrently
    //   - Manual button path (slugFilter set): 0 minutes -- the
    //     button waits for the user, who wants fresh feedback fast.
    //     Per-keyword for one client × ~15 kw × 30s = ~7-8 minutes
    //     wall, but the snapshot can run on whatever's landed
    //     (lookback=1 catches that day's incremental data).
    if (runSnapshot) {
      if (!slugFilter) {
        // Roster-wide cron path: wait for per-keyword to settle.
        await step.sleep("wait-for-citations", "5 minutes");
      }
      for (const slug of plan.clientSlugs) {
        await step.do(`snapshot-${slug}-lb${snapshotLookbackDays}`, async () => {
          await buildClientSnapshot(this.env, slug, snapshotLookbackDays);
        });
      }
    }

    // Real-time citation alert digests. Citations steps wrote alert
    // rows; this step batches them per client and emails Signal+
    // customers. Separate step so a Resend hiccup retries delivery
    // without re-running 6-engine citation queries.
    await step.do("citation-alerts-digest", async () => {
      await sendPendingDigests(this.env);
    });

    // GSC pulls + backup are weekly hygiene. Cron sets this true on
    // Mondays only. Manual button always leaves false.
    if (!runGscAndBackup) return;

    await step.do("gsc-pull", async () => {
      await pullGscData(this.env);
    });

    // NOTE: digest dispatch lives in cron.ts, NOT here. Cloudflare
    // Workflows share subrequest budget across all steps in one
    // instance: dispatching SendDigestWorkflow.create() inside this
    // workflow hits "Too many subrequests" once the citations steps
    // have spent the budget. Cron handler dispatches with a fresh
    // budget instead, which works.

    await step.do("backup", async () => {
      await runWeeklyBackup(this.env);
    });

    // Reddit FAQ drift check. For each client with a deployed FAQ
    // schema, see if any new citation-generating Reddit threads have
    // appeared since the last build. If yes, rebuild + re-deploy so
    // the schema covers the freshest questions. Only runs on the
    // Mondays-only path (runGscAndBackup=true) so it never piggybacks
    // on the manual-button path that the user is waiting on. Skipped
    // for clients with no deployment yet -- those are opt-in via the
    // dashboard "Build first FAQ deployment" button.
    await step.do("reddit-faq-drift-check", async () => {
      await runRedditFaqDriftCheck(this.env);
    });
  }
}

async function runRedditFaqDriftCheck(env: Env): Promise<void> {
  const { buildFAQDeployment } = await import("../reddit-faq-deployment");

  // Every client with the prerequisites: business_description populated
  // and at least one Reddit-citing run in the last 90 days. buildFAQDeployment
  // handles grader filtering and auto-deploy internally -- there is
  // nothing for the cron to gate.
  const rows = (
    await env.DB.prepare(
      `SELECT ic.client_slug,
              ic.business_name, ic.business_url, ic.business_description,
              (SELECT MAX(r.generated_at) FROM reddit_faq_deployments r
                WHERE r.client_slug = ic.client_slug) AS last_generated_at,
              (SELECT COUNT(*) FROM citation_runs cr
                 JOIN citation_keywords ck ON ck.id = cr.keyword_id
                WHERE ck.client_slug = ic.client_slug
                  AND cr.run_at > unixepoch() - 90*86400
                  AND cr.cited_urls LIKE '%reddit.com%') AS reddit_runs_90d
         FROM injection_configs ic
        WHERE ic.business_description IS NOT NULL
          AND LENGTH(ic.business_description) > 50`,
    ).all<{
      client_slug: string;
      business_name: string | null;
      business_url: string | null;
      business_description: string | null;
      last_generated_at: number | null;
      reddit_runs_90d: number;
    }>()
  ).results;

  for (const r of rows) {
    if (!r.business_description) continue;
    if (r.reddit_runs_90d === 0) continue;

    // For clients with an existing build, skip if no new Reddit-citing
    // runs have landed since the last build (saves Claude calls when
    // nothing changed).
    if (r.last_generated_at) {
      const newRuns = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM citation_runs cr
           JOIN citation_keywords ck ON ck.id = cr.keyword_id
          WHERE ck.client_slug = ? AND cr.run_at > ?
            AND cr.cited_urls LIKE '%reddit.com%'`,
      )
        .bind(r.client_slug, r.last_generated_at)
        .first<{ n: number }>();
      if (!newRuns || newRuns.n === 0) continue;
    }

    try {
      await buildFAQDeployment(
        env,
        r.client_slug,
        {
          name: r.business_name || r.client_slug,
          description: r.business_description,
          url: r.business_url || undefined,
        },
        90,
      );
    } catch (e) {
      console.error(`reddit-faq build/drift failed for ${r.client_slug}:`, e);
    }
  }
}

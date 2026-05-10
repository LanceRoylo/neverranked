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

    // Plan: list out which clients we're snapshotting. (Per-keyword
    // citation runs already happened in their own workflow instances
    // before this one was dispatched.)
    const plan = await step.do("plan", async () => {
      return await planCitationRun(this.env, slugFilter);
    });

    // Snapshot per client. Conditional -- only Mondays via cron, or
    // when manual button explicitly requests fresh same-day data.
    if (runSnapshot) {
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
  }
}

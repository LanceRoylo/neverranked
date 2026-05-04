/**
 * WeeklyExtrasWorkflow -- citations, GSC pulls, digest emails, and
 * backup. Runs after the per-domain scan workflows on Monday morning.
 *
 * Lives in its own Worker invocation so it gets a clean 1000-subrequest
 * budget independent of cron-handler overhead. Each step is wrapped in
 * step.do() so a transient citation API failure retries that step only,
 * without re-running GSC + digests + backup.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, Domain } from "../types";
import { runWeeklyCitations } from "../citations";
import { pullGscData } from "../gsc";
import { runWeeklyBackup } from "../backup";
import { sendPendingDigests } from "../lib/citation-alerts";

// Same shape as cron.ts uses; declared here to keep imports tight.
export type WeeklyExtrasParams = Record<string, never>;

export class WeeklyExtrasWorkflow extends WorkflowEntrypoint<Env, WeeklyExtrasParams> {
  async run(_event: WorkflowEvent<WeeklyExtrasParams>, step: WorkflowStep): Promise<void> {
    await step.do("citations", async () => {
      await runWeeklyCitations(this.env);
    });

    // Real-time citation alert digests. Citations step writes alert
    // rows; this step batches them per client and emails Signal+
    // customers. Separate step so a Resend hiccup retries delivery
    // without re-running 4-engine citation queries.
    await step.do("citation-alerts-digest", async () => {
      await sendPendingDigests(this.env);
    });

    await step.do("gsc-pull", async () => {
      await pullGscData(this.env);
    });

    // NOTE: digest dispatch lives in cron.ts, NOT here. Cloudflare
    // Workflows share subrequest budget across all steps in one
    // instance: the citations step burns through ~1000 subreqs over 3
    // minutes, so by the time we hit a dispatch-digests step inside
    // this same workflow, every .create() call hits "Too many
    // subrequests" -- verified empirically (instance 3970ec9d 2026-04-28).
    // The cron handler dispatches SendDigestWorkflow directly with a
    // fresh budget, which works.

    await step.do("backup", async () => {
      await runWeeklyBackup(this.env);
    });
  }
}

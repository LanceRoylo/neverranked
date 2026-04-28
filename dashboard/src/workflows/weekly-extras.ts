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

// Same shape as cron.ts uses; declared here to keep imports tight.
export type WeeklyExtrasParams = Record<string, never>;

export class WeeklyExtrasWorkflow extends WorkflowEntrypoint<Env, WeeklyExtrasParams> {
  async run(_event: WorkflowEvent<WeeklyExtrasParams>, step: WorkflowStep): Promise<void> {
    await step.do("citations", async () => {
      await runWeeklyCitations(this.env);
    });

    await step.do("gsc-pull", async () => {
      await pullGscData(this.env);
    });

    await step.do("dispatch-digests", async () => {
      // Fan out one SendDigestWorkflow per opted-in user so each gets
      // its own 1000-subrequest budget. Running them inline blew the
      // per-invocation cap once we crossed ~5 users with multi-domain
      // gather queries.
      const users = (await this.env.DB.prepare(
        "SELECT id FROM users WHERE email_digest = 1"
      ).all<{ id: number }>()).results;
      let dispatched = 0;
      for (const u of users) {
        try {
          await this.env.SEND_DIGEST_WORKFLOW.create({ params: { userId: u.id } });
          dispatched++;
        } catch (e) {
          console.log(`[weekly-extras] failed to dispatch digest for user ${u.id}: ${e}`);
        }
      }
      console.log(`[weekly-extras] dispatched ${dispatched}/${users.length} digest workflows`);
    });

    await step.do("backup", async () => {
      await runWeeklyBackup(this.env);
    });
  }
}

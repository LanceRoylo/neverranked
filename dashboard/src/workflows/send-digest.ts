/**
 * SendDigestWorkflow -- one digest email for one user, in its own
 * Worker invocation so each user gets a fresh 1000-subrequest budget.
 *
 * Dispatched by WeeklyExtrasWorkflow's digests step. The previous
 * design ran all users inline and silently failed once D1 query count
 * crossed the per-invocation cap (one user with 10 domains generates
 * ~150 queries; 7 users blew through 1000 mid-loop, so users 5 - 7
 * never received a digest).
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, Domain, User } from "../types";

export type SendDigestParams = { userId: number };

export class SendDigestWorkflow extends WorkflowEntrypoint<Env, SendDigestParams> {
  async run(event: WorkflowEvent<SendDigestParams>, step: WorkflowStep): Promise<void> {
    const { userId } = event.payload;

    await step.do("send", async () => {
      const user = await this.env.DB.prepare(
        "SELECT * FROM users WHERE id = ?"
      ).bind(userId).first<User>();
      if (!user) throw new Error(`user ${userId} not found`);
      if (!user.email_digest) return; // user opted out since dispatch

      const domains = (await this.env.DB.prepare(
        "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, domain"
      ).all<Domain>()).results;

      // sendWeeklyDigests handles the per-user filtering, query
      // gathering, branding, send, and delivery log. Calling it with a
      // one-element user list keeps one code path for both cron and
      // workflow dispatch.
      const { sendWeeklyDigests } = await import("../cron");
      await sendWeeklyDigests(domains, this.env, [user]);
    });
  }
}

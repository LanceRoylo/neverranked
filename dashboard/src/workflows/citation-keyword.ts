/**
 * CitationKeywordWorkflow -- a single (client, keyword) citation run.
 *
 * Each instance gets its own fresh 1000-subrequest budget, isolated
 * from every other keyword's run. This is the architecture that
 * actually works at the cron path's scale.
 *
 * Why per-instance instead of per-step:
 * Cloudflare Workflows share the 1000-subrequest budget across ALL
 * steps in a single instance. A 15-keyword fan-out as steps within
 * one workflow exhausts the budget after ~2 keywords; the remaining
 * 13 steps "succeed" with 0 seconds duration because every internal
 * fetch() throws "Too many subrequests" silently, all 6 promises in
 * the engine Promise.allSettled reject, and the function returns 0
 * rows. Verified empirically: instance 3bf7120b-daea-4454 on
 * 2026-05-10 ran kw 9 (12s, real rows) + kw 10 (21s, real rows) +
 * kw 11-15 (0s each, no rows).
 *
 * The dispatcher (cron or manual button) creates one workflow
 * instance per keyword. ~75 instances/day for the full roster (5
 * clients × 15 keywords). Each instance is independent.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../types";
import { runOneKeywordCitations } from "../citations";

export type CitationKeywordParams = {
  clientSlug: string;
  keywordId: number;
};

export class CitationKeywordWorkflow extends WorkflowEntrypoint<Env, CitationKeywordParams> {
  async run(event: WorkflowEvent<CitationKeywordParams>, step: WorkflowStep): Promise<void> {
    const { clientSlug, keywordId } = event.payload;

    // Single step. The whole thing is a small unit of work that fits
    // comfortably in one step's budget. No fan-out, no shared budget
    // contention. step.do gives us automatic retry on transient
    // WorkflowInternalError without us having to manage it.
    await step.do(`citation-${clientSlug}-${keywordId}`, async () => {
      await runOneKeywordCitations(this.env, clientSlug, keywordId);
    });
  }
}

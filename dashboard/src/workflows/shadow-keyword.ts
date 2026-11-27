/**
 * ShadowKeywordWorkflow: the December plain-question shadow for one keyword.
 *
 * Its own workflow class, not a flag on CitationKeywordWorkflow, so nothing in
 * the production measurement path changes. One instance per keyword gets its
 * own subrequest budget, the same reason production uses one per keyword.
 *
 * Writes only engine_shadow_runs (via lib/shadow-runner.ts). See
 * lib/shadow-arms.ts for what is measured and why.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../types";
import {
  SHADOW_ARMS,
  SHADOW_NIGHTLY_CAP_USD,
  loadKeywordContext,
  runShadowArm,
  shadowOffsetSeconds,
  spentTonight,
} from "../lib/shadow-runner";

export type ShadowKeywordParams = {
  clientSlug: string;
  keywordId: number;
  night: string;
};

/** A keyword that already started finishes its arms so its pairs stay whole,
 *  but no arm starts once spend passes the cap by this much. Bounds the
 *  overshoot from keywords running at the same time. */
const ARM_CEILING_OVER_CAP_USD = 0.5;

export class ShadowKeywordWorkflow extends WorkflowEntrypoint<Env, ShadowKeywordParams> {
  async run(event: WorkflowEvent<ShadowKeywordParams>, step: WorkflowStep): Promise<void> {
    const { clientSlug, keywordId, night } = event.payload;

    // Deterministic offset so a replayed step sleeps the same amount.
    await step.sleep(`shadow-wait-${keywordId}`, shadowOffsetSeconds(keywordId) * 1000);

    // Whole-keyword gate: once tonight's spend reaches the cap, no new keyword starts.
    const go = await step.do(`shadow-gate-${keywordId}`, async () => {
      const spent = await spentTonight(this.env, night);
      if (spent >= SHADOW_NIGHTLY_CAP_USD) {
        console.log(`[shadow] ${night} cap reached ($${spent.toFixed(2)}), keyword ${keywordId} skipped`);
        return false;
      }
      return true;
    });
    if (!go) return;

    const ctx = await step.do(`shadow-ctx-${keywordId}`, async () => loadKeywordContext(this.env, clientSlug, keywordId));
    if (!ctx) return;

    for (const a of SHADOW_ARMS) {
      await step.do(
        `shadow-${keywordId}-${a.arm}`,
        // One retry, a minute later. A shadow reading that fails twice is
        // filed as a failure row by runShadowArm, not retried into a burst.
        { retries: { limit: 1, delay: "60 seconds", backoff: "constant" }, timeout: "5 minutes" },
        async () => {
          const spent = await spentTonight(this.env, night);
          if (spent >= SHADOW_NIGHTLY_CAP_USD + ARM_CEILING_OVER_CAP_USD) {
            console.log(`[shadow] ${night} hard ceiling reached, ${a.arm} skipped for keyword ${keywordId}`);
            return "ceiling";
          }
          return runShadowArm(this.env, a, ctx, clientSlug, keywordId, night);
        },
      );
    }
  }
}

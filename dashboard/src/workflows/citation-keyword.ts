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
  /** Set by the scheduled sweep, omitted by the manual "Run now" button.
   *  When true the instance waits a deterministic slice of SPREAD_SECONDS
   *  before doing any work, so the roster's OpenAI calls arrive paced instead
   *  of in one burst. A human clicking Run expects an answer in seconds, so
   *  that path never sleeps. */
  spread?: boolean;
};

/** How wide to fan the roster's execution.
 *
 * gpt-5-search-api is capped at 80,000 tokens per MINUTE, which is a rate, not
 * a daily allowance. The whole roster used to execute inside ~3 minutes and
 * saturate that bucket: on 2026-09-07 every OpenAI call in three days landed
 * between 06:00 and 06:04 UTC, 65 succeeded and 199 were rejected 429 with
 * "Used 80000". Widening to 15 minutes multiplies the available budget in the
 * window by five without changing the daily volume by a single call.
 *
 * WIDENED 900 -> 2400 on 2026-09-09, from the failure rows rather than a
 * guess. All 416 openai rejections in the last 7 days are one error:
 * "Rate limit reached for gpt-5-search-api ... on tokens per min (TPM):
 * Limit 80000, Used 80000". Not spend -- the org is at $21 of a $300 cap
 * with auto-reload on. A search model bills the retrieved page content, so
 * a call runs about 34k tokens and 80k TPM is roughly 2.3 calls a minute.
 *
 * 900 seconds spaced ~88 daily attempts about 17s apart, which is ~3.5
 * calls a minute and still over the ceiling: openai recovered to 78% of
 * peer median but kept refusing about a fifth of its calls. 2400 gives
 * ~46s spacing, near 44k TPM, with headroom for a slow call.
 *
 * Daily VOLUME is unchanged. This moves the same calls further apart, so
 * the effect on spend is that calls which were rejected free now succeed
 * and bill.
 *
 * Dispatch-side delay cannot do this job. It runs inside the scheduled
 * handler's wall clock, so spacing 93 dispatches far enough apart would risk
 * the cron itself. Sleeping inside the workflow is free: long sleeps are what
 * Workflows are for, and the instance is not billed while it waits. */
const SPREAD_SECONDS = 2400;

export class CitationKeywordWorkflow extends WorkflowEntrypoint<Env, CitationKeywordParams> {
  async run(event: WorkflowEvent<CitationKeywordParams>, step: WorkflowStep): Promise<void> {
    const { clientSlug, keywordId, spread } = event.payload;

    // Deterministic, NOT random. A workflow step can be replayed, and a
    // Math.random() delay computed outside a step would change on replay.
    // Multiplying by a prime before the modulo matters: keyword ids are
    // handed out sequentially per client, so `id % SPREAD_SECONDS` would drop
    // one client's whole set into a narrow band and rebuild the burst it is
    // meant to break up. The prime scatters consecutive ids across the range.
    if (spread) {
      const offsetSeconds = (keywordId * 97) % SPREAD_SECONDS;
      if (offsetSeconds > 0) {
        await step.sleep(`spread-${keywordId}`, offsetSeconds * 1000);
      }
    }

    // Single step. The whole thing is a small unit of work that fits
    // comfortably in one step's budget. No fan-out, no shared budget
    // contention.
    // Retry policy set EXPLICITLY, because this step can now throw and the
    // inherited default is wrong for it. Cloudflare's default is 5 attempts
    // at a 10 second initial delay. The failures this step actually sees are
    // refusals and rate limits, so a retry 10 seconds later re-enters the
    // same 429 window and rebuilds precisely the burst SPREAD_SECONDS above
    // exists to break up.
    //
    // 3 attempts at 60 seconds exponential: enough to ride out a transient
    // (a D1 blip, one malformed response), short of hammering seven engines
    // that are all refusing. A total outage stays loud either way, because
    // the instance fails once the attempts are spent.
    await step.do(
      `citation-${clientSlug}-${keywordId}`,
      {
        retries: { limit: 3, delay: "60 seconds", backoff: "exponential" },
        timeout: "5 minutes",
      },
      async () => {
        const r = await runOneKeywordCitations(this.env, clientSlug, keywordId);
        // The return value used to be discarded, and ok was hard-coded
        // true, so this step reported success no matter what happened inside
        // it. runOneKeywordCitations catches every engine rejection
        // internally and never throws, which meant step.do's automatic retry
        // could not fire: a keyword that wrote zero rows completed cleanly
        // and was never attempted again.
        //
        // Throw only on TOTAL failure. Partial coverage is a normal reading
        // and retrying it would re-call engines that already answered. Zero
        // rows across every engine is systemic (keys, D1, the keyword row
        // itself) and is the case a retry can actually fix. It is also safe
        // to retry precisely because nothing was written, so there is
        // nothing to duplicate.
        if (!r.ok) {
          throw new Error(
            `citation run wrote no rows for ${clientSlug}/keyword ${keywordId}: ${r.error ?? "unknown"}`,
          );
        }
      },
    );
  }
}

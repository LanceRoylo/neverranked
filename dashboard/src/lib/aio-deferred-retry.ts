/**
 * Deferred second pass for Google AI Overview calls that DataForSEO refused
 * with a transient error ("40101 Internal SE Server Error" and friends).
 *
 * WHY. queryGoogleAIO already retries once, two seconds later. Measured over
 * 2026-10-05..11-05, 8 to 17 AIO calls a night still failed after that retry,
 * spread across 56 of the 63 questions and across the whole 40-minute sweep
 * window rather than in bursts. A two-second retry lands inside the same
 * upstream hiccup; a retry minutes later usually does not. Every other surface
 * collects 63 of 63.
 *
 * HOW. The nightly CitationKeywordWorkflow (sweep path only, never the manual
 * "Run now" button) holds back the engine_failures row for a transient AIO
 * failure, sleeps, and asks again in a fresh step. Sleeping inside a workflow
 * costs nothing and runs on the workflow's own budget, so this adds no work to
 * the 06:00 scheduled invocation and needs no cron trigger.
 *
 * WHAT IT KEEPS (tested in test/aio-deferred-retry.test.ts):
 *   - a recovered reading is written once, stamped with the time it was
 *     actually read, and only while it is still the same UTC day as the sweep
 *     attempt it replaces;
 *   - no second row: a google_ai_overview row for the keyword on that UTC day
 *     means the reading already landed, and the insert itself refuses a
 *     second, so a retried attempt cannot slip one in after the check;
 *   - a call that still fails on the final pass is recorded in
 *     engine_failures, never stored as an empty answer;
 *   - a deferred step that exhausts its retries is caught, and a separate step
 *     records the failure;
 *   - if the first step's own code throws, the failure is recorded on the way
 *     out.
 *
 * THE LIMITS. The held failure lives in workflow state until it is recorded,
 * so it is lost if the first step exhausts its attempts on timeouts, if the
 * instance is terminated by hand, or if D1 is down for the recording step too.
 * The first two leave an Errored instance and the third a loud step failure,
 * and each reads as no row and no failure for that keyword that night.
 */
import { isTransientDfsFailure, stripRetryPrefix } from "./dataforseo-status";

/** Waits before each deferred attempt, in seconds. Two passes: 10 then 20
 *  minutes. The sweep's last keyword starts around 06:40 UTC, so the final
 *  pass lands near 07:15, the same UTC day with hours to spare. */
export const AIO_DEFER_DELAYS_SECONDS: readonly number[] = [600, 1200];

/** What the first step hands to the deferred steps. Plain data: it crosses a
 *  workflow step boundary and must serialize. */
export interface DeferredAioFailure {
  keyword: string;
  status: number;
  detail: string;
  /** Epoch seconds, taken just before the sweep's first AIO call. */
  firstAttemptAt: number;
}

/** Midnight UTC of that day. One reading per keyword per UTC day is the unit
 *  everything downstream counts in. */
export function utcDayStart(epochSeconds: number): number {
  return epochSeconds - (epochSeconds % 86400);
}

export function utcDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/** A reading is only a substitute for the sweep attempt it replaces while it
 *  is still that attempt's UTC day. After that it would be counted as the
 *  NEXT night's reading, so the failure is recorded instead. */
export function deferralIsStale(firstAttemptAt: number, nowSeconds: number): boolean {
  return utcDay(firstAttemptAt) !== utcDay(nowSeconds);
}

/** Should this failure be held for a later pass instead of recorded now?
 *  queryGoogleAIO prefixes a failure that survived its own retry with
 *  "after retry: ", and isTransientDfsFailure anchors on "DataForSEO", so the
 *  prefix is stripped before classifying. Billing and auth refusals are never
 *  deferred: they must reach the alert in skipReason on the first call. */
export function shouldDeferAio(failure: { status: number; detail: string } | undefined, finalPass: boolean): boolean {
  if (!failure || finalPass) return false;
  return isTransientDfsFailure(failure.status, stripRetryPrefix(failure.detail));
}

/** engine_failures detail for a call that also failed its deferred pass. */
export function deferredFailureDetail(detail: string): string {
  return `deferred retry: ${detail}`;
}

/** The parts of a WorkflowStep this loop uses, so tests can drive it. */
export interface DeferredStep {
  sleep(name: string, ms: number): Promise<void>;
  do<T>(name: string, config: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
}

/** Waits and asks again until a pass settles it. A step that exhausts its
 *  retries is caught here: uncaught it ends the instance, and the failure held
 *  in `pending` would never reach engine_failures. */
export async function runDeferredAioPasses(
  step: DeferredStep,
  name: string,
  first: DeferredAioFailure | null,
  retry: (deferred: DeferredAioFailure, finalPass: boolean) => Promise<{ deferred?: DeferredAioFailure }>,
  recordLost: (deferred: DeferredAioFailure) => Promise<void>,
): Promise<void> {
  let pending = first;
  for (let i = 0; pending && i < AIO_DEFER_DELAYS_SECONDS.length; i++) {
    const deferred: DeferredAioFailure = pending;
    const finalPass = i === AIO_DEFER_DELAYS_SECONDS.length - 1;
    await step.sleep(`aio-deferred-wait-${name}-${i}`, AIO_DEFER_DELAYS_SECONDS[i] * 1000);
    try {
      const res = await step.do(
        `aio-deferred-${name}-${i}`,
        { retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        async () => ({ deferred: (await retry(deferred, finalPass)).deferred ?? null }),
      );
      pending = res.deferred;
    } catch (e) {
      console.log(`[aio-deferred] pass ${i} for ${name} exhausted its retries, recording the failure: ${e instanceof Error ? e.message : String(e)}`);
      await step.do(
        `aio-deferred-lost-${name}-${i}`,
        { retries: { limit: 3, delay: "60 seconds", backoff: "exponential" }, timeout: "1 minute" },
        async () => {
          await recordLost(deferred);
          return { recorded: true };
        },
      );
      return;
    }
  }
}

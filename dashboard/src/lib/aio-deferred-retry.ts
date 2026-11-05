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
 * GUARANTEES (each one is tested in test/aio-deferred-retry.test.ts):
 *   - a recovered reading is written once, stamped with the time it was
 *     actually read, and only while it is still the same UTC day as the sweep
 *     attempt it replaces;
 *   - it is never written twice: an existing google_ai_overview row for the
 *     keyword since the first attempt means the step already landed;
 *   - a call that still fails on the final pass is recorded in
 *     engine_failures, never stored as an empty answer;
 *   - if the first step cannot return the deferral (it threw), the failure is
 *     recorded immediately, so it can never vanish.
 */
import { isTransientDfsFailure } from "./dataforseo-status";

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
  const bare = failure.detail.replace(/^(?:after retry: |deferred retry: )+/, "");
  return isTransientDfsFailure(failure.status, bare);
}

/** engine_failures detail for a call that also failed its deferred pass. */
export function deferredFailureDetail(detail: string): string {
  return `deferred retry: ${detail}`;
}

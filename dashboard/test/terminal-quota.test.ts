import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminalQuota } from "../src/citations";

/* The two 429s.
 *
 * OpenAI spends one status code on two opposite conditions, and this function
 * is the only thing separating them. Both bodies below are REAL, copied from
 * engine_failures rather than invented:
 *
 *   - the quota body stopped measurement on 2026-09-12 (balance -$0.17)
 *   - the rate-limit body is the one from 2026-09-02 that says "try again in
 *     76ms" and MUST keep retrying
 *
 * A false positive here is worse than the bug this function fixes: treating a
 * TPM limit as terminal would abandon the sweep on the first burst and
 * recreate the under-collection that ran from 2026-08-24 to 2026-09-09. */

test("the measured billing-exhaustion body is terminal", () => {
  const body = JSON.stringify({
    error: {
      message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
      type: "insufficient_quota",
    },
  });
  assert.equal(isTerminalQuota(body), true);
});

test("the measured rate-limit body is NOT terminal and must keep retrying", () => {
  const body = JSON.stringify({
    error: {
      message: "Rate limit reached for gpt-5-search-api on tokens per min (TPM): Limit 80000, Used 80000, Requested 102. Please try again in 76ms.",
      type: "tokens",
    },
  });
  assert.equal(isTerminalQuota(body), false);
});

test("other permanent billing shapes are caught", () => {
  assert.equal(isTerminalQuota('{"error":{"code":"billing_hard_limit_reached"}}'), true);
  assert.equal(isTerminalQuota("You exceeded your current quota, please check your plan and billing details."), true);
});

test("a 503 overload body is not mistaken for a billing stop", () => {
  assert.equal(isTerminalQuota('{"error":{"message":"The server is overloaded. Please try again later.","type":"server_error"}}'), false);
});

test("an empty or unreadable body is never terminal, so retries still happen", () => {
  // resp.clone().text() falls back to "" when the body cannot be read. That
  // must not be read as a billing stop: unknown means keep trying.
  assert.equal(isTerminalQuota(""), false);
});

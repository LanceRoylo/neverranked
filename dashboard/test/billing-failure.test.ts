/* A failed payment must be loud, name who to pay, and never read as data.
 *
 * 2026-10-01: Google declined the card behind the Gemini API with the prepaid
 * credit already at -$0.24. The billing alert recognised OpenAI's wording only.
 * Worse, DataForSEO (AI Overviews AND the Bing control) reported no failure at
 * all: every error returned an empty result, which reads as "no overview
 * rendered". engine_failures had never held a bing or AIO row.
 *
 * The "real" strings below are taken from engine_failures rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBillingFailure, billingAlert, vendorFor } from "../src/lib/billing-failure";
import { isNoResults } from "../src/lib/dataforseo-status";
import { queryBing } from "../src/citations-bing";
import { queryGoogleAIO } from "../src/citations-google-aio";
import type { Env } from "../src/types";

test("billing refusals are recognised for every vendor", () => {
  // real, openai 2026-09-12
  assert.ok(isBillingFailure(429, '{ "error": { "message": "You have no credits remaining in your account." } }'));
  assert.ok(isBillingFailure(400, "Your credit balance is too low to access the Anthropic API."));
  assert.ok(isBillingFailure(402, "anything at all"));
  assert.ok(isBillingFailure(200, "DataForSEO 40200: Payment Required."));
  assert.ok(isBillingFailure(429, "Your prepayment credits are depleted."));
  assert.ok(isBillingFailure(403, "Billing account is disabled"));
  assert.ok(isBillingFailure(401, "Insufficient balance"));
});

test("rate limits and outages are NOT billing", () => {
  // real, perplexity / gemma / gemini / openai rows in engine_failures
  assert.ok(!isBillingFailure(429, '{"error":{"message":"upstream model is overloaded, please try again"}}'));
  assert.ok(!isBillingFailure(524, "error code: 524"));
  assert.ok(!isBillingFailure(400, '{ "error": { "code": 400, "message": "User location is not supported" } }'));
  assert.ok(!isBillingFailure(500, '{ "error": { "message": "The server had an error processing your request." } }'));
  assert.ok(!isBillingFailure(429, "Rate limit reached for gpt-4o. Please try again in 76ms."));
  assert.ok(!isBillingFailure(429, "RESOURCE_EXHAUSTED"));
  assert.ok(!isBillingFailure(200, "DataForSEO 50000: Internal Error."));
});

test("a DataForSEO refusal names both surfaces it stops", () => {
  const a = billingAlert("bing", "DataForSEO 40200: Payment Required.");
  assert.match(a.title, /^DataForSEO: payment refused, google_ai_overview \+ bing measurement stopped/);
  assert.match(a.detail, /stops 2 measured surfaces at once/);
  assert.match(a.detail, /DataForSEO dashboard > Billing/);
});

test("an Anthropic refusal says the deliverables stop too", () => {
  assert.match(billingAlert("anthropic", "Your credit balance is too low").detail, /readout prose/);
});

test("a provider-tagged engine still finds its vendor", () => {
  assert.equal(vendorFor("gemma:api.deepinfra.com").name, "DeepInfra");
  assert.equal(vendorFor("something_new").name, "something_new");
});

test("'No Search Results' is an answer, everything else is a failure", () => {
  assert.ok(isNoResults(40102, "No Search Results."));
  assert.ok(isNoResults(undefined, "no search results"));
  assert.ok(!isNoResults(40100, "You are not authorized"));
  assert.ok(!isNoResults(40200, "Payment Required."));
});

const ENV = { DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" } as unknown as Env;

async function withFetch<T>(body: unknown, status: number, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test("Bing: an empty DataForSEO balance is reported as a failure, not an empty answer", async () => {
  const r = await withFetch({ status_code: 40200, status_message: "Payment Required." }, 200, () => queryBing("q", ENV));
  assert.ok(r.failure, "must carry a failure");
  assert.equal(r.failure?.engine, "bing");
  assert.ok(isBillingFailure(r.failure?.status, r.failure?.detail ?? ""));
});

test("AI Overviews: an HTTP error is a failure, so it never reads as 'no overview rendered'", async () => {
  const r = await withFetch({ error: "nope" }, 401, () => queryGoogleAIO("q", ENV));
  assert.ok(r.failure);
  assert.equal(r.failure?.engine, "google_ai_overview");
  assert.equal(r.failure?.status, 401);
});

test("a task with no search results stays a genuine empty answer", async () => {
  const r = await withFetch(
    { status_code: 20000, tasks: [{ status_code: 40102, status_message: "No Search Results." }] },
    200,
    () => queryBing("q", ENV),
  );
  assert.equal(r.failure, undefined);
  assert.equal(r.urls.length, 0);
});

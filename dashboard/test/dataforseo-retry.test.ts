/* After 2026-10-01 made DataForSEO failures visible, google_ai_overview lost
 * 16, 22 and 11 calls a night to "40101 Internal SE Server Error", out of
 * ~63. One retry for transient errors only; billing and auth never retry. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryGoogleAIO } from "../src/citations-google-aio";
import { queryBing } from "../src/citations-bing";
import { isTransientDfsFailure } from "../src/lib/dataforseo-status";
import type { Env } from "../src/types";

const ENV = { DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" } as unknown as Env;
const SE_ERROR = { status_code: 20000, tasks: [{ status_code: 40101, status_message: "Internal SE Server Error." }] };
const OK_EMPTY = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };
const PAY = { status_code: 40200, status_message: "Payment Required." };

async function withFetchSequence<T>(bodies: unknown[], fn: () => Promise<T>): Promise<{ r: T; calls: number }> {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const b = bodies[Math.min(calls, bodies.length - 1)];
    calls++;
    return new Response(JSON.stringify(b), { status: 200 });
  }) as typeof fetch;
  try { return { r: await fn(), calls }; } finally { globalThis.fetch = real; }
}

test("a transient search-engine error is retried once and the retry's answer is used", async () => {
  const { r, calls } = await withFetchSequence([SE_ERROR, OK_EMPTY], () => queryGoogleAIO("q", ENV));
  assert.equal(calls, 2);
  assert.equal(r.failure, undefined, "the second attempt succeeded");
});

test("a billing refusal is never retried, so it reaches the alert on the first call", async () => {
  const { r, calls } = await withFetchSequence([PAY, OK_EMPTY], () => queryBing("q", ENV));
  assert.equal(calls, 1);
  assert.match(r.failure?.detail ?? "", /40200/);
});

test("a failure that survives the retry says so", async () => {
  const { r, calls } = await withFetchSequence([SE_ERROR, SE_ERROR], () => queryBing("q", ENV));
  assert.equal(calls, 2);
  assert.match(r.failure?.detail ?? "", /^after retry: DataForSEO 40101/);
});

test("only transient failures qualify", () => {
  assert.ok(isTransientDfsFailure(200, "DataForSEO 40101: Internal SE Server Error."));
  assert.ok(isTransientDfsFailure(200, "DataForSEO 50000: Internal Error."));
  assert.ok(isTransientDfsFailure(503, "DataForSEO HTTP 503: x"));
  assert.ok(isTransientDfsFailure(0, "DataForSEO fetch error: reset"));
  assert.ok(!isTransientDfsFailure(200, "DataForSEO 40200: Payment Required."));
  assert.ok(!isTransientDfsFailure(401, "DataForSEO HTTP 401: unauthorized"));
  assert.ok(!isTransientDfsFailure(200, "DataForSEO 40100: You are not authorized"));
});

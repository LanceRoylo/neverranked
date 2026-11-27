/* 2026-11-06: the probe made one try at the moment the sweep started, and its
 * alert called every failure a refusal. Three nights of Google 503s read as a
 * dead key while the sweep on the same key collected 58 of 63. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeAll, probeFailureDetail } from "../src/lib/instrument-check";
import type { Env } from "../src/types";

const env = { GEMINI_API_KEY: "secret-key" } as unknown as Env;

async function withFetch(answers: Array<() => Response>, run: () => Promise<void>): Promise<number> {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => answers[Math.min(calls++, answers.length - 1)]()) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = real; }
  return calls;
}
const busy = () => new Response("model overloaded", { status: 503 });
const ok = () => new Response(JSON.stringify({ modelVersion: "gemini-2.5-flash" }), { status: 200 });

test("a busy provider gets one retry, and a recovery is a success", async () => {
  const calls = await withFetch([busy, ok], async () => {
    assert.deepEqual(await probeAll(env, 0), [{ engine: "gemini", version: "gemini-2.5-flash" }]);
  });
  assert.equal(calls, 2);
});

test("busy twice fails, says why, and is marked transient", async () => {
  const calls = await withFetch([busy], async () => {
    const [r] = await probeAll(env, 0);
    assert.equal(r.version, null);
    assert.equal(r.transient, true);
    assert.match(r.failure ?? "", /HTTP 503: model overloaded \(after one retry\)/);
  });
  assert.equal(calls, 2);
});

test("a timeout or dropped connection is retried like a 5xx", async () => {
  const calls = await withFetch([() => { throw new Error("timed out"); }], async () => {
    const [r] = await probeAll(env, 0);
    assert.equal(r.transient, true);
    assert.match(r.failure ?? "", /no response: timed out/);
  });
  assert.equal(calls, 2);
});

test("a refusal is not retried", async () => {
  const calls = await withFetch([() => new Response("API key not valid", { status: 400 })], async () => {
    const [r] = await probeAll(env, 0);
    assert.equal(r.transient, false);
    assert.match(r.failure ?? "", /HTTP 400/);
  });
  assert.equal(calls, 1);
});

test("the key never reaches the stored reason", async () => {
  await withFetch([() => { throw new Error("failed: https://x.test/m?key=secret-key&alt=1"); }], async () => {
    const [r] = await probeAll(env, 0);
    assert.doesNotMatch(r.failure ?? "", /secret-key/);
  });
});

test("the alert does not call a busy provider a dead key", () => {
  const d = probeFailureDetail([{ engine: "gemini", version: null, failure: "HTTP 503: busy (after one retry)", transient: true }]);
  assert.match(d, /^No response from: gemini\./, "alert-autoclose parses this");
  assert.match(d, /HTTP 503/);
  assert.doesNotMatch(d, /dead or rotated key/);
});

test("one refusal among busy providers still reads as a refusal", () => {
  const d = probeFailureDetail([
    { engine: "gemini", version: null, failure: "HTTP 503", transient: true },
    { engine: "openai", version: null, failure: "HTTP 401", transient: false },
  ]);
  assert.match(d, /dead or rotated key/);
  assert.match(d, /openai: HTTP 401/);
});

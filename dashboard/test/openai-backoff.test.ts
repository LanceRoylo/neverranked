/**
 * OpenAI retry shape.
 *
 * Guards the 2026-09-02 correction. The original backoff used a 30s base
 * doubling to a 300s cap, written before anyone had read a real 429 body.
 * The measured bodies all said "Please try again in 76ms", so the first wait
 * was roughly 400x too long and calls slept through the whole sweep instead
 * of recovering. These tests pin the corrected shape so it cannot drift back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openAIBackoffMs } from "../src/citations.ts";

const hdr = (o: Record<string, string>) => new Headers(o);

test("first retry is sub-second, not half a minute", () => {
  const first = openAIBackoffMs(1, null);
  assert.ok(first <= 500, `first wait should be sub-second, got ${first}ms`);
  assert.ok(first >= 100, `first wait should clear the floor, got ${first}ms`);
});

test("the whole retry budget is tens of seconds, not hundreds", () => {
  let total = 0;
  for (let a = 1; a <= 8; a++) total += openAIBackoffMs(a, null);
  assert.ok(total < 60_000, `total retry budget should stay under a minute, got ${Math.round(total / 1000)}s`);
});

test("retry-after-ms is read as MILLISECONDS", () => {
  // OpenAI's own header. Treating it as seconds would wait 1000x too long.
  assert.equal(openAIBackoffMs(1, hdr({ "retry-after-ms": "76" })), 100); // floored
  assert.equal(openAIBackoffMs(1, hdr({ "retry-after-ms": "850" })), 850);
});

test("retry-after is read as SECONDS", () => {
  assert.equal(openAIBackoffMs(1, hdr({ "retry-after": "2" })), 2000);
});

test("retry-after-ms wins when both headers are present", () => {
  const w = openAIBackoffMs(1, hdr({ "retry-after-ms": "300", "retry-after": "120" }));
  assert.equal(w, 300, "the millisecond header is the more precise one");
});

test("backoff grows with attempts but is capped", () => {
  const a1 = openAIBackoffMs(1, null), a4 = openAIBackoffMs(4, null), a20 = openAIBackoffMs(20, null);
  assert.ok(a4 > a1, "later attempts wait longer");
  assert.ok(a20 <= 20_000, `cap should hold, got ${a20}ms`);
});

test("garbage headers fall through to exponential rather than zero", () => {
  for (const bad of [{ "retry-after": "abc" }, { "retry-after": "-5" }, { "retry-after": "0" }]) {
    const w = openAIBackoffMs(2, hdr(bad));
    assert.ok(w >= 100, `bad header must not produce a hot loop, got ${w}ms`);
  }
});

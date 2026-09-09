import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordRunVerdict } from "../src/lib/keyword-run-verdict.ts";

/**
 * The line this pins: partial coverage is a reading, total silence is a
 * failure. Getting it wrong in either direction is expensive. Too strict
 * and every keyword retries whenever one engine is out of credit, calling
 * APIs that cannot answer. Too loose and we are back to `ok: true`, where a
 * keyword that measured nothing looked exactly like one that measured
 * everything.
 */

test("REGRESSION: zero rows is NOT ok, which is what ok:true always claimed", () => {
  const v = keywordRunVerdict(0, ["openai", "gemini"], 7);
  assert.equal(v.ok, false);
});

test("partial coverage is a normal reading and must not retry", () => {
  // Six engines answered, one refused. This is an ordinary day.
  const v = keywordRunVerdict(6, ["openai"], 7);
  assert.equal(v.ok, true);
  assert.equal(v.error, undefined);
});

test("a single row is enough, because one measurement is still a measurement", () => {
  assert.equal(keywordRunVerdict(1, ["openai", "gemini", "bing", "gemma", "anthropic", "google_aio"], 7).ok, true);
});

test("the error names the engines that refused, so the log says what broke", () => {
  const v = keywordRunVerdict(0, ["openai", "gemma"], 7);
  assert.match(v.error!, /no rows written across 7 engines/);
  assert.match(v.error!, /rejected: openai, gemma/);
});

test("zero rows with zero rejections is reported as skipped, not as refused", () => {
  // Every engine returned but nothing counted as a measurement: missing API
  // keys, or skipReason recording a failure on all seven. Nothing threw, so
  // naming refusals here would invent a cause.
  const v = keywordRunVerdict(0, [], 7);
  assert.equal(v.ok, false);
  assert.match(v.error!, /all engines skipped or returned no measurement/);
  assert.doesNotMatch(v.error!, /rejected/);
});

test("ok results never carry an error string", () => {
  for (const rows of [1, 3, 7, 21]) {
    assert.equal(keywordRunVerdict(rows, [], 7).error, undefined);
  }
});

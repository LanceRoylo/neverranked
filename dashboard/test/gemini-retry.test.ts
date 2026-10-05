/* Gemini lost 2, 6, 6 then 11 of ~63 readings a night to "This model is
 * overloaded" (503), every one after the single 5s retry. 2026-10-05. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GEMINI_503_RETRY_WAITS_MS } from "../src/citations";

const SRC = fs.readFileSync(new URL("../src/citations.ts", import.meta.url), "utf8");

test("two growing waits, so a longer overload is still recovered", () => {
  assert.equal(GEMINI_503_RETRY_WAITS_MS.length, 2);
  assert.ok(GEMINI_503_RETRY_WAITS_MS[1] > GEMINI_503_RETRY_WAITS_MS[0]);
  // Inside the keyword workflow's time budget: under half a minute in total.
  assert.ok(GEMINI_503_RETRY_WAITS_MS.reduce((a, b) => a + b, 0) <= 30000);
});

test("only a 503 is retried, and the same request is sent again", () => {
  assert.match(SRC, /if \(resp\.status !== 503\) break;/);
  assert.match(SRC, /const send = \(\) => fetch\(GEMINI_ENDPOINT/);
});

test("a failure that survives says how many retries it took", () => {
  assert.match(SRC, /after \$\{retries\} retr/);
});

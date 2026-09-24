/* A gate that flags correct numbers is a gate people learn to wave through,
 * and waving it through is how a wrong number ships. Both cases here are real
 * flags raised on real drafts generated 2026-09-23. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnverifiedNumbers, priorDeliveredNumbers } from "../src/lib/memo-generator";

const ALLOWED = new Set(["48", "7", "22"]);

test("an HTTP status code in an instruction is not a measurement", () => {
  const body = "If you own it, configure a permanent 301 redirect to hawaiitheatre.com.";
  assert.deepEqual(findUnverifiedNumbers(body, ALLOWED), []);
});

test("other status codes in instructions are equally safe", () => {
  for (const b of ["the page returns a 404 error", "a 200 response confirms it", "set up a 302 redirect"]) {
    assert.deepEqual(findUnverifiedNumbers(b, ALLOWED), [], b);
  }
});

test("a bare number that merely looks like a status code is still checked", () => {
  // No technical noun after it, so it is an ordinary unexplained figure.
  assert.deepEqual(findUnverifiedNumbers("we counted 301 citations", ALLOWED), ["301"]);
});

test("the drift warning may cite the figure we actually delivered last month", () => {
  // HTC, 2026-09: correct, required by the question-set drift rule, flagged.
  const prior = priorDeliveredNumbers("Your overall share rose from 48% to 52%.");
  const body = "That figure is computed on a different set of questions than last month's 52%, so the two are not comparable.";
  assert.deepEqual(findUnverifiedNumbers(body, ALLOWED, new Set(), prior), []);
});

test("the exemption does not launder an invented figure for THIS period", () => {
  const prior = priorDeliveredNumbers("Your overall share rose from 48% to 52%.");
  // 52 is in the prior memo, but presented as a current reading.
  assert.deepEqual(findUnverifiedNumbers("Your share is now 52%.", ALLOWED, new Set(), prior), ["52"]);
});

test("a past-tense frame cannot rescue a number we never delivered", () => {
  const prior = priorDeliveredNumbers("Your overall share rose from 48% to 52%.");
  assert.deepEqual(findUnverifiedNumbers("last month's 67%", ALLOWED, new Set(), prior), ["67"]);
});

test("an undelivered prior body contributes nothing", () => {
  assert.equal(priorDeliveredNumbers(null).size, 0);
  assert.equal(priorDeliveredNumbers(undefined).size, 0);
});

test("prior figures with thousands separators are harvested as one number", () => {
  assert.equal(priorDeliveredNumbers("across 2,346 runs").has("2346"), true);
});

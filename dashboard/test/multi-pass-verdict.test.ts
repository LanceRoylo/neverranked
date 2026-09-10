import { test } from "node:test";
import assert from "node:assert/strict";
import { extractUnsupported } from "../src/lib/multi-pass.ts";

/**
 * weekly-brief-generator burned all three regeneration attempts, three days
 * running, on claims the judge had already accepted.
 *
 * The judge was asked for {"unsupported": [string]} -- a bare list with
 * nowhere to record a verdict -- so it wrote its adjudication into the string
 * and the code counted every entry as a failure. These are verbatim from the
 * 2026-09-10 alert.
 */

test("REGRESSION: a finding the judge itself calls supported is not a failure", () => {
  const out = extractUnsupported({
    findings: [
      { claim: "ChatGPT cited clients in nearly one-third of runs",
        verdict: "supported",
        why: "the source states 32%, and nearly one-third is a fair paraphrase" },
      { claim: "The single OpenAI fetch and single Anthropic fetch are notable",
        verdict: "supported",
        why: "the source shows Anthropic at 20% and OpenAI at 32%" },
    ],
  });
  assert.deepEqual(out, []);
});

test("a genuinely unsupported claim still fails, with its reason attached", () => {
  const out = extractUnsupported({
    findings: [
      { claim: "Google AI Overviews trailed at 15%", verdict: "unsupported", why: "no such figure in the source" },
      { claim: "five monitored categories", verdict: "supported", why: "stated in the source" },
    ],
  });
  assert.equal(out.length, 1);
  assert.match(out[0], /Google AI Overviews trailed at 15%/);
  assert.match(out[0], /no such figure in the source/);
});

test("a missing verdict fails CLOSED, so a schema-ignoring model cannot pass everything", () => {
  const out = extractUnsupported({ findings: [{ claim: "Citations rose from 517 to 827" }] });
  assert.equal(out.length, 1);
});

test("the legacy bare-string shape still works", () => {
  // A model that ignores the new schema entirely must not silently pass.
  const out = extractUnsupported({ unsupported: ["Client citations rose from 517 to 827", "  ", "five monitored categories"] });
  assert.deepEqual(out, ["Client citations rose from 517 to 827", "five monitored categories"]);
});

test("an empty or malformed response is not a failure", () => {
  assert.deepEqual(extractUnsupported({ findings: [] }), []);
  assert.deepEqual(extractUnsupported({}), []);
  assert.deepEqual(extractUnsupported({ findings: [null, 42, { verdict: "unsupported" }] as never }), []);
});

test("verdict casing and whitespace do not change the answer", () => {
  const out = extractUnsupported({
    findings: [
      { claim: "a", verdict: " Supported " },
      { claim: "b", verdict: "UNSUPPORTED" },
    ],
  });
  assert.deepEqual(out, ["b"]);
});

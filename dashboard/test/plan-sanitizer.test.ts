import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* The sanitizer is module-private, so exercise it through the real patterns.
 * Fixtures are the ACTUAL lines from HTC's frozen plan, set 2026-07-03, seven
 * weeks before the reclassification that invalidated them. */
const SRC = readFileSync(new URL("../src/lib/memo-inputs.ts", import.meta.url), "utf8");

function sanitize(plan: string): string {
  let out = plan;
  out = out.replace(/\bMicrosoft Copilot\b/gi, "the Bing organic control [this plan said Microsoft Copilot, reclassified 2026-08-22]");
  out = out.replace(/\bCopilot\b/gi, "the Bing organic control [reclassified 2026-08-22]");
  out = out.replace(/\bsix of the seven AI tools\b/gi, "most of the six AI tools");
  out = out.replace(/\b(?:seven|7)\s+AI\s+(?:tools?|engines?)\b/gi, "six AI tools plus a Bing organic control, seven measured surfaces");
  return out;
}

test("the sanitizer in the source matches the one under test", () => {
  // If someone edits the real patterns without updating these, fail loudly
  // rather than testing a copy that no longer resembles production.
  assert.ok(SRC.includes("sanitizePlanForAuthoring"), "function missing");
  assert.ok(SRC.includes("reclassified 2026-08-22"), "marker text changed");
});

test("the real plan lines lose every forbidden term", () => {
  const real = [
    "- Six of the seven AI tools cite hawaiitheatre.com steadily.",
    "- **Microsoft Copilot moved from 0% to 1% in July**, its first citations of you in our measurement.",
    "**What to expect in the numbers:** the fast lane is Copilot and ChatGPT search, the two Bing-fed tools.",
    "*Measurement: locked 18-question set, 7 AI engines, monthly cadence, frozen and hashed per run.*",
  ].join("\n");
  const out = sanitize(real);
  assert.ok(!/copilot/i.test(out), `Copilot survived: ${out}`);
  assert.ok(!/\b(?:seven|7)\s+AI\s+(?:tools?|engines?)\b/i.test(out), `retired count survived: ${out}`);
});

test("the substitution is visible, not silent", () => {
  // The author must be able to tell a correction happened rather than
  // believing the plan always read this way.
  const out = sanitize("the fast lane is Copilot and ChatGPT search");
  assert.match(out, /reclassified 2026-08-22/);
});

test("a clean plan is returned untouched", () => {
  const clean = "**What to expect:** ChatGPT search is the lane to watch. Six AI tools plus a Bing organic control, seven measured surfaces.";
  assert.equal(sanitize(clean), clean);
});

test("null and empty pass through", () => {
  assert.equal(sanitize(""), "");
});

test("'seven measured surfaces' is never rewritten, because it is correct", () => {
  const s = "seven measured surfaces";
  assert.equal(sanitize(s), s);
});

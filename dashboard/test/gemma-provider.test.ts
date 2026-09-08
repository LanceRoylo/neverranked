import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGemmaProvider } from "../src/citations.ts";

/**
 * Together AI deprecates its serverless Gemma endpoint on 2026-09-15.
 *
 * Gemma is not a spare part. After the 2026-09-07 business-name fix it is a
 * contracted client's strongest measured surface, ahead of every
 * citation-grade engine, with their first paid readout weeks away. Losing it
 * mid-month blanks their best number.
 *
 * The cutover is deliberately a SECRET, not a deploy: whichever key is present
 * picks the host, DeepInfra wins when both are set, and deleting the DeepInfra
 * secret rolls back. These tests pin that ordering because it is the entire
 * migration plan.
 */

const env = (o: Record<string, string | undefined>) => o as never;

test("DeepInfra wins when both keys are present (the cutover)", () => {
  const p = resolveGemmaProvider(env({ TOGETHER_API_KEY: "tog", DEEPINFRA_API_KEY: "dpi" }));
  assert.ok(p);
  assert.equal(p!.host, "deepinfra");
  assert.equal(p!.apiKey, "dpi");
  assert.match(p!.endpoint, /deepinfra\.com/);
});

test("Together still serves while it is the only key (today)", () => {
  const p = resolveGemmaProvider(env({ TOGETHER_API_KEY: "tog" }));
  assert.ok(p);
  assert.equal(p!.host, "together");
  assert.match(p!.endpoint, /together\.xyz/);
});

test("removing the DeepInfra secret rolls back to Together", () => {
  // Rollback must need no deploy either. If this ever stops holding, a bad
  // cutover cannot be undone from the CLI at 2am.
  const before = resolveGemmaProvider(env({ TOGETHER_API_KEY: "tog", DEEPINFRA_API_KEY: "dpi" }));
  const after = resolveGemmaProvider(env({ TOGETHER_API_KEY: "tog" }));
  assert.equal(before!.host, "deepinfra");
  assert.equal(after!.host, "together");
});

test("no key at all yields null, so the engine is skipped rather than erroring", () => {
  assert.equal(resolveGemmaProvider(env({})), null);
});

test("both hosts are addressed over the OpenAI-compatible chat path", () => {
  // The request body is byte-identical across hosts; only the URL and bearer
  // change. If either endpoint stops ending in /chat/completions the shared
  // body in queryGemma no longer applies.
  for (const keys of [{ TOGETHER_API_KEY: "t" }, { DEEPINFRA_API_KEY: "d" }]) {
    const p = resolveGemmaProvider(env(keys));
    assert.match(p!.endpoint, /\/chat\/completions$/);
    assert.match(p!.endpoint, /^https:\/\//);
  }
});

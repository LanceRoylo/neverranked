import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHADOW_ARMS,
  armRequestBody,
  extractorRequestBody,
  isShadowNight,
  shadowCost,
  textNamesBusiness,
} from "../src/lib/shadow-arms";
import { dispatchShadowRuns, runShadowArm, shadowOffsetSeconds } from "../src/lib/shadow-runner";

/* The December shadow measures the plain question beside production.
 *
 * The rule these tests defend: a shadow reading can never reach anything a
 * client sees or anything that judges production. It writes one table,
 * engine_shadow_runs, and nothing outside the shadow files reads that table. */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "..", "src");
const SHADOW_FILES = ["lib/shadow-arms.ts", "lib/shadow-runner.ts", "workflows/shadow-keyword.ts"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

test("shadow code writes only engine_shadow_runs", () => {
  for (const f of SHADOW_FILES) {
    // Code only: the files' own comments name the tables they must not touch.
    const src = fs.readFileSync(path.join(SRC, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const writes = [...src.matchAll(/\b(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+([a-z_]+)/gi)];
    for (const w of writes) assert.equal(w[2], "engine_shadow_runs", `${f} writes to ${w[2]}`);
    for (const banned of ["recordSpend", "logCronRun", "withCronLogging", "engine_failures", "admin_alerts", "cron_runs", "citation_snapshots"]) {
      assert.ok(!src.includes(banned), `${f} mentions ${banned}`);
    }
  }
});

test("nothing outside the shadow files reads or writes engine_shadow_runs", () => {
  const allowed = new Set(SHADOW_FILES.map((f) => path.join(SRC, f)));
  const leaks = walk(SRC).filter((p) => !allowed.has(p) && fs.readFileSync(p, "utf8").includes("engine_shadow_runs"));
  assert.deepEqual(leaks, []);
});

test("every arm sends the question alone, with no instruction", () => {
  const q = "Where can I hear live jazz tonight?";
  for (const a of SHADOW_ARMS) {
    assert.equal(a.instruction, "", a.arm);
    const body = armRequestBody(a, q);
    const json = JSON.stringify(body);
    assert.ok(!("instructions" in body), `${a.arm} sends instructions`);
    assert.ok(!("system" in body), `${a.arm} sends a system prompt`);
    assert.ok(!json.includes('"role":"system"'), `${a.arm} sends a system message`);
    assert.ok(!/business names|recommend/i.test(json), `${a.arm} carries production's wording`);
    assert.ok(json.includes(JSON.stringify(q).slice(1, -1)), `${a.arm} does not send the question verbatim`);
  }
  assert.equal(new Set(SHADOW_ARMS.map((a) => a.arm)).size, SHADOW_ARMS.length, "arm names must be unique");
});

test("same-model arms keep production's settings", () => {
  const byArm = Object.fromEntries(SHADOW_ARMS.map((a) => [a.arm, armRequestBody(a, "q")]));
  assert.equal((byArm.perplexity_plain as { temperature: number }).temperature, 0.3);
  assert.equal((byArm.gemma_plain as { temperature: number }).temperature, 0);
  assert.equal((byArm.gemini_plain_old as { generationConfig: { temperature: number; maxOutputTokens: number } }).generationConfig.temperature, 0.4);
  assert.equal((byArm.gemini_plain_old as { generationConfig: { maxOutputTokens: number } }).generationConfig.maxOutputTokens, 2048);
  assert.ok(!("temperature" in byArm.claude_plain_haiku45), "no temperature on Claude arms");
});

test("shadow nights are the eleven December dates where day % 3 == 1", () => {
  const nights: number[] = [];
  for (let d = 1; d <= 31; d++) if (isShadowNight(new Date(Date.UTC(2026, 11, d, 6, 30)))) nights.push(d);
  assert.deepEqual(nights, [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31]);
  assert.equal(isShadowNight(new Date(Date.UTC(2026, 10, 28, 6, 30))), false, "not in November");
  assert.equal(isShadowNight(new Date(Date.UTC(2027, 0, 1, 6, 30))), false, "not in January");
});

test("the shadow starts after the production sweep window", () => {
  for (const id of [1, 97, 500, 12345]) {
    const s = shadowOffsetSeconds(id);
    assert.ok(s >= 45 * 60 && s < 45 * 60 + 2400, `offset ${s}`);
  }
});

test("name match is a plain case-insensitive substring with a 4-character floor", () => {
  assert.equal(textNamesBusiness("Try the Example Grill on Main", "example grill"), true);
  assert.equal(textNamesBusiness("Nothing here", "Example Grill"), false);
  assert.equal(textNamesBusiness("abc abc", "abc"), false, "too short to match");
  assert.equal(textNamesBusiness("Anything", null), false);
});

test("cost estimates are positive for priced models and zero for unknown ones", () => {
  assert.ok(shadowCost("gpt-5-search-api", 16000, 1000) > 0.02);
  assert.equal(shadowCost("not-a-model", 1000, 1000), 0);
});

test("the extractor asks for names only, as structured output, with thinking off", () => {
  const b = extractorRequestBody("Some answer") as { output_config: { format: { type: string } }; thinking: { type: string } };
  assert.equal(b.output_config.format.type, "json_schema");
  assert.equal(b.thinking.type, "disabled");
});

test("dispatch is off unless SHADOW_RUNS_ENABLED is exactly '1'", async () => {
  const dec1 = new Date(Date.UTC(2026, 11, 1, 6, 30));
  for (const v of [undefined, "", "0", "true", "yes"]) {
    const r = await dispatchShadowRuns({ SHADOW_RUNS_ENABLED: v } as never, dec1);
    assert.equal(r.dispatched, 0);
  }
});

/* A fake D1 that records every statement, to prove the runtime path writes
 * nothing but engine_shadow_runs, including on a refusal. */
function fakeEnv(sqls: string[]) {
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    first: async () => { sqls.push(sql); return null; },
    run: async () => { sqls.push(sql); return { success: true }; },
    all: async () => { sqls.push(sql); return { results: [] }; },
  });
  return { DB: { prepare: (sql: string) => stmt(sql) }, ANTHROPIC_API_KEY: "test-key" } as never;
}

async function withFetch(responses: unknown[], fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify(responses[Math.min(i++, responses.length - 1)]), { status: 200 })) as typeof fetch;
  try { await fn(); } finally { globalThis.fetch = orig; }
}

test("a memory arm run touches only engine_shadow_runs", async () => {
  const sqls: string[] = [];
  const arm = SHADOW_ARMS.find((a) => a.arm === "claude_plain_haiku45")!;
  await withFetch([
    { content: [{ type: "text", text: "You could try Example Grill." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } },
    { content: [{ type: "text", text: JSON.stringify({ businesses: ["Example Grill"] }) }], stop_reason: "end_turn", usage: { input_tokens: 30, output_tokens: 5 } },
  ], async () => {
    const r = await runShadowArm(fakeEnv(sqls), arm, { question: "q", businessName: "Example Grill" }, "c", 1, "2026-12-01");
    assert.equal(r, "written");
  });
  assert.ok(sqls.length > 0);
  for (const s of sqls) assert.match(s, /engine_shadow_runs/, s);
});

test("a refusal is filed as a failure row, never an empty answer", async () => {
  const sqls: string[] = [];
  const binds: unknown[][] = [];
  const env = {
    DB: { prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => { sqls.push(sql); return null; },
        run: async () => { sqls.push(sql); binds.push(args); return { success: true }; },
      }),
    }) },
    ANTHROPIC_API_KEY: "test-key",
  } as never;
  const arm = SHADOW_ARMS.find((a) => a.arm === "claude_plain_sonnet55")!;
  await withFetch([{ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }], async () => {
    await runShadowArm(env, arm, { question: "q", businessName: "Example Grill" }, "c", 1, "2026-12-01");
  });
  const row = binds[0];
  assert.ok(row, "a row is written");
  // client_named (index 11) is NULL and failure (index 16) is set.
  assert.equal(row[11], null);
  assert.match(String(row[16]), /^refusal/);
  // cost_usd (index 15): a call that did not complete is not charged.
  assert.equal(row[15], 0);
  for (const s of sqls) assert.match(s, /engine_shadow_runs/, s);
});

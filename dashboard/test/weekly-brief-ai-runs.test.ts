/* The week-of-2026-09-21 draft wrote "Across six AI surfaces and 2,807 runs".
 * 2,807 is 5 x 433 + 226 (Google AI Overviews) + 416 (the Bing control). The
 * six AI surfaces had run 2,391 times. The writer was handed one total that
 * pooled every surface, labelled "Total runs this week", and attributed it to
 * the AI surfaces. It now gets the AI-surface total, labelled as such, and the
 * control's runs on their own line. That week's real per-engine counts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runTotals, runsBlock, aggregateLastWeek, buildUserMessage } from "../src/weekly-brief-generator";
import { openD1 } from "./support/d1-sqlite";

const WEEK = [
  { engine: "anthropic", runs: 433, client_cited: 83 },
  { engine: "gemini", runs: 433, client_cited: 120 },
  { engine: "gemma", runs: 433, client_cited: 88 },
  { engine: "openai", runs: 433, client_cited: 50 },
  { engine: "perplexity", runs: 433, client_cited: 78 },
  { engine: "bing", runs: 416, client_cited: 1 },
  { engine: "google_ai_overview", runs: 226, client_cited: 25 },
];

test("the AI-surface total excludes the control: 2,391, not 2,807", () => {
  assert.deepEqual(runTotals(WEEK), { aiSurfaceRuns: 2391, controlRuns: 416, allRuns: 2807 });
  const block = runsBlock({ aiSurfaceRuns: 2391, controlRuns: 416 });
  assert.match(block, /Runs on the six AI surfaces this week \(Bing control excluded\): 2391/);
  assert.match(block, /Bing control runs this week, NOT an AI surface and never part of an AI-surface total: 416/);
  assert.doesNotMatch(block, /2807/);
});

test("the stats block the writer reads carries 2,391 and 416, and never 2,807", async (t) => {
  const d1 = await openD1(`
    CREATE TABLE citation_runs (id INTEGER PRIMARY KEY, keyword_id INTEGER, engine TEXT, client_cited INTEGER, run_at INTEGER, sentiment TEXT);
    CREATE TABLE citation_keywords (id INTEGER PRIMARY KEY, client_slug TEXT, keyword TEXT, active INTEGER);
    CREATE TABLE domains (id INTEGER PRIMARY KEY, client_slug TEXT, domain TEXT, is_competitor INTEGER, active INTEGER);
    CREATE TABLE bot_hits (id INTEGER PRIMARY KEY, bot_pattern TEXT, hit_at INTEGER);
    CREATE TABLE reddit_citations (id INTEGER PRIMARY KEY, subreddit TEXT, run_at INTEGER);
    CREATE TABLE referrer_hits (id INTEGER PRIMARY KEY, engine TEXT, hit_at INTEGER);
    CREATE TABLE instrument_events (id INTEGER PRIMARY KEY, occurred_at INTEGER, kind TEXT, scope TEXT, engine TEXT, client_slug TEXT, detail TEXT);`);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const start = Math.floor(Date.UTC(2026, 8, 21) / 1000); // Monday 2026-09-21
  const ins = d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, run_at) VALUES (?, ?, ?, ?)");
  for (const e of WEEK) {
    for (let i = 0; i < e.runs; i++) ins.run(1 + (i % 20), e.engine, i < e.client_cited ? 1 : 0, start + 3600 + (i % 6) * 86400);
  }
  const stats = await aggregateLastWeek(d1.env, start);
  assert.equal(stats.aiSurfaceRuns, 2391);
  assert.equal(stats.controlRuns, 416);
  const msg = buildUserMessage(stats);
  assert.match(msg, /Runs on the six AI surfaces this week \(Bing control excluded\): 2391/);
  assert.match(msg, /Bing control runs this week, NOT an AI surface and never part of an AI-surface total: 416/);
  assert.doesNotMatch(msg, /2807/, "the pooled total is not in what the writer reads");
  assert.doesNotMatch(msg, /Total runs this week/);
});

test("the writer is told an AI-surface run total never includes the control", () => {
  const src = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");
  assert.match(src, /Any run total attributed to the AI surfaces, the AI tools or the six surfaces is the AI-surface run total in the stats block, which excludes the Bing control/);
});

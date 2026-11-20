import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeCoverage,
  describeCoverage,
  coverageFingerprint,
  type KeywordCoverage,
} from "../src/lib/sweep-coverage";

/* The fixture below is the REAL shape of the 2026-09-10 to 2026-09-14 outage,
 * taken from production. Slugs are anonymized: this repo is public and
 * per-client figures belong in the private docs repo.
 *
 *     client     active kw   rows written per night
 *     alpha             22   wrote normally
 *     bravo             30   wrote normally
 *     charlie           15   wrote normally
 *     delta             11   ZERO, on every engine, for five nights
 *
 * 78 dispatched, 67 written, every night, no alert. Three engine-shaped checks
 * were running and all three stayed silent, because all seven engines lost the
 * same eleven keywords and therefore agreed with each other perfectly. */

function kw(clientSlug: string, n: number, rowsWritten: number, idBase = 0): KeywordCoverage[] {
  return Array.from({ length: n }, (_, i) => ({
    clientSlug,
    keywordId: idBase + i,
    keyword: `q${i}`,
    rowsWritten,
  }));
}

/** 7 engines x 1 run each is the healthy per-keyword shape. */
const HEALTHY = 7;

const OUTAGE: KeywordCoverage[] = [
  ...kw("alpha", 22, HEALTHY, 100),
  ...kw("bravo", 30, HEALTHY, 200),
  ...kw("charlie", 15, HEALTHY, 300),
  ...kw("delta", 11, 0, 400),
];

test("the real outage: 11 of 78 dark, all belonging to one client", () => {
  const s = summarizeCoverage(OUTAGE);
  assert.equal(s.activeKeywords, 78);
  assert.equal(s.darkKeywords, 11);
  assert.deepEqual(s.affected, [{ clientSlug: "delta", active: 11, dark: 11 }]);
});

test("a client dark on every keyword is called out separately", () => {
  // This is the distinction that matters operationally. One dark keyword is a
  // glitch; a client whose entire set is dark is not being measured at all,
  // and nobody is going to notice from the numbers because there are none.
  assert.deepEqual(summarizeCoverage(OUTAGE).fullyDark, ["delta"]);
});

test("a healthy night raises nothing", () => {
  const s = summarizeCoverage(kw("alpha", 67, HEALTHY));
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
  assert.deepEqual(s.fullyDark, []);
});

test("partial engine coverage is NOT dark", () => {
  // Google AI Overviews legitimately declines to answer roughly 55% of
  // questions, so a keyword that wrote 3 rows instead of 7 is an ordinary
  // night. If this ever returns dark, the check fires every single night and
  // becomes noise, which is the failure mode it exists to avoid.
  const s = summarizeCoverage(kw("alpha", 30, 3));
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
});

test("one dark keyword in a healthy client is still reported", () => {
  const s = summarizeCoverage([...kw("alpha", 21, HEALTHY, 100), ...kw("alpha", 1, 0, 900)]);
  assert.equal(s.darkKeywords, 1);
  assert.deepEqual(s.affected, [{ clientSlug: "alpha", active: 22, dark: 1 }]);
  // Not fully dark: 1 of 22 is a glitch, not an unmeasured client.
  assert.deepEqual(s.fullyDark, []);
});

test("affected clients sort worst-first so the title names the worst one", () => {
  const s = summarizeCoverage([
    ...kw("alpha", 22, 0, 100),
    ...kw("bravo", 30, HEALTHY, 200),
    ...kw("charlie", 15, 0, 300),
  ]);
  assert.deepEqual(s.affected.map((c) => c.clientSlug), ["alpha", "charlie"]);
});

test("the alert body names the client and the count, not just a degradation", () => {
  const body = describeCoverage(summarizeCoverage(OUTAGE));
  assert.match(body, /11 of 78 active keywords wrote no row/);
  assert.match(body, /delta: 11\/11 dark/);
  assert.match(body, /EVERY keyword for this client is dark/);
  // It must point at dispatch, not at the engines. Every engine looked fine
  // during the real outage, and a reader sent to check API keys would have
  // found nothing wrong and concluded the alert was spurious.
  assert.match(body, /workflows are being created/);
});

test("fingerprint distinguishes two different outages", () => {
  const a = coverageFingerprint(summarizeCoverage(OUTAGE));
  const b = coverageFingerprint(
    summarizeCoverage([...kw("alpha", 22, 0, 100), ...kw("delta", 11, HEALTHY, 400)]),
  );
  assert.notEqual(a, b);
  // And is stable for the same outage, so a persisting problem dedupes
  // within the day rather than alerting on every evaluation pass.
  assert.equal(a, coverageFingerprint(summarizeCoverage(OUTAGE)));
});

test("an empty roster is not an outage", () => {
  // Everything deactivated on purpose (a client removed for cost) must not
  // read as 0 of 0 dark and alert forever.
  const s = summarizeCoverage([]);
  assert.equal(s.activeKeywords, 0);
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
});

/* The watchdog must judge a FINISHED sweep.
 *
 * It assumed the sweep settled within ~20 minutes and judged at 06:30
 * regardless. That aged out as the keyword count grew: on 2026-09-25, with 63
 * active keywords, rows were still landing at 06:41 and the check fired at
 * 06:30:46 calling two of the paying client's keywords dark. Both wrote
 * minutes later. The same false alarm fired on 2026-09-17.
 *
 * A guard that cries wolf gets skimmed, and skimming it is how the real one
 * gets missed -- which is what this file exists to prevent. */
test("the in-flight check treats recent writes as a running sweep", async () => {
  const { sweepInFlight } = await import("../src/lib/sweep-coverage");
  const now = 1_790_000_000;
  const env = (ts: number | null) => ({
    DB: { prepare: () => ({ first: async () => ({ ts }) }) },
  } as never);

  assert.equal(await sweepInFlight(env(now - 30), now), true, "writing 30s ago is in flight");
  assert.equal(await sweepInFlight(env(now - 120), now), true, "writing 2m ago is in flight");
  assert.equal(await sweepInFlight(env(now - 20 * 60), now), false, "20m of silence is settled");
  assert.equal(await sweepInFlight(env(null), now), false, "no rows at all is not in flight");
});

test("a deferral raises nothing rather than reporting unreached keywords", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/lib/sweep-coverage.ts", import.meta.url), "utf8");
  assert.match(src, /deferring to the next run/, "the deferral must be logged, not silent");
  assert.match(src, /alerted: false/);
});

test("an in-flight check that fails proceeds instead of going silent", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/lib/sweep-coverage.ts", import.meta.url), "utf8");
  const i = src.indexOf("in-flight check failed");
  assert.ok(i > 0, "a failure to determine flight state must not suppress the guard");
});

/* 2026-11-06: the check deferred every night from 2026-09-26, logged success
 * with dark=0/0, and judged nothing for 42 nights. */
const ALERTS = "CREATE TABLE admin_alerts (id INTEGER PRIMARY KEY, client_slug TEXT, type TEXT, title TEXT, detail TEXT, read_at INTEGER, created_at INTEGER);";

async function deferringDb() {
  const { openD1, SCHEMA } = await import("./support/d1-sqlite");
  const d1 = await openD1(SCHEMA + ALERTS);
  if (!d1) return null;
  // Written a moment ago, as if the sweep were still running.
  d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (1, 'openai', 0, '[]', '[]', 'x', ?)")
    .run(Math.floor(Date.now() / 1000) - 30);
  return d1;
}

test("late AI Overviews rows do not read as a running sweep", async (t) => {
  const { openD1, SCHEMA } = await import("./support/d1-sqlite");
  const { sweepInFlight } = await import("../src/lib/sweep-coverage");
  const d1 = await openD1(SCHEMA);
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const now = 1_790_000_000;
  const add = (engine: string, at: number) => d1.db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, cited_urls, cited_entities, response_text, run_at) VALUES (1, ?, 0, '[]', '[]', 'x', ?)").run(engine, at);
  add("openai", now - 35 * 60);
  add("google_ai_overview", now - 30);
  assert.equal(await sweepInFlight(d1.env, now), false, "a deferred retry 35 minutes after the sweep ended");
  add("perplexity", now - 30);
  assert.equal(await sweepInFlight(d1.env, now), true, "any other engine still writing is a running sweep");
});

test("a deferral logs as a deferral, never as a success", async (t) => {
  const d1 = await deferringDb();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const { runSweepCoverageCheck } = await import("../src/cron");
  await runSweepCoverageCheck(d1.env);
  const row = d1.db.prepare("SELECT status, detail FROM cron_runs WHERE task_name = 'sweep_coverage'").get() as { status: string; detail: string };
  assert.equal(row.status, "partial");
  assert.match(row.detail, /^deferred/);
  assert.equal((d1.db.prepare("SELECT COUNT(*) AS n FROM admin_alerts").get() as { n: number }).n, 0, "one deferral is allowed");
});

test("a second deferral in a row alerts, once", async (t) => {
  const d1 = await deferringDb();
  if (!d1) { t.skip("node:sqlite unavailable"); return; }
  const { runSweepCoverageCheck } = await import("../src/cron");
  const alerts = () => d1.db.prepare("SELECT type FROM admin_alerts").all() as Array<{ type: string }>;
  await runSweepCoverageCheck(d1.env);
  await new Promise((r) => setTimeout(r, 1100)); // cron_runs orders by whole seconds
  await runSweepCoverageCheck(d1.env);
  assert.deepEqual(alerts().map((a) => a.type), ["sweep_coverage_deferred"]);
  await new Promise((r) => setTimeout(r, 1100));
  await runSweepCoverageCheck(d1.env);
  assert.equal(alerts().length, 1, "an unread alert is not repeated");
});

test("the check runs after the sweep, ahead of the briefing", async () => {
  const fs = await import("node:fs");
  const index = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const branch = index.indexOf('if (cron === "0 17 * * *"');
  assert.ok(index.indexOf("runSweepCoverageCheck", branch) > branch);
  assert.ok(index.indexOf("runSweepCoverageCheck", branch) < index.indexOf("maybeSendAutomationDigest", branch));
  const cron = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
  const body = cron.slice(cron.indexOf("export async function runPostSweepEvaluation"));
  assert.ok(!body.slice(0, 6000).includes("checkSweepCoverage"), "at 06:30 the sweep is still writing");
});

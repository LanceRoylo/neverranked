/* The database half of the comparison, run against a real SQLite database.
 *
 * The fixture reproduces the paying client's September 2026 coverage: 18
 * questions measured every day, 12 more added on 09-02 that also missed 09-24
 * after a maintenance script switched them off for a day. The first paid
 * month-over-month comparison is computed on the 18, decided 2026-10-01, and
 * these tests are what make it safe to wire into the memo after the 10-15
 * freeze lifts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadStableCoreCounts, loadInstrumentEvents } from "../src/lib/compare-loader";
import { computeComparison } from "../src/lib/compare-periods";
import type { Env } from "../src/types";

/** Just enough of D1's prepared-statement surface for these two loaders. */
function d1(db: DatabaseSync): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            const stmt = db.prepare(sql);
            return {
              all: async () => ({ results: stmt.all(...(args as never[])) }),
              first: async () => stmt.get(...(args as never[])) ?? null,
            };
          },
        };
      },
    },
  } as unknown as Env;
}

const ts = (day: string, h = 6) => Date.parse(`${day}T${String(h).padStart(2, "0")}:00:00Z`) / 1000;
const SEP = { start: ts("2026-09-01", 0), end: ts("2026-10-01", 0) };
const OCT = { start: ts("2026-10-01", 0), end: ts("2026-10-04", 0) };
const ENGINES = ["perplexity", "anthropic", "bing"];

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE citation_keywords (id INTEGER PRIMARY KEY, client_slug TEXT, keyword TEXT);
    CREATE TABLE citation_runs (id INTEGER PRIMARY KEY, keyword_id INTEGER, engine TEXT, client_cited INTEGER, run_at INTEGER);
    CREATE TABLE instrument_events (id INTEGER PRIMARY KEY, occurred_at INTEGER, kind TEXT, scope TEXT,
      engine TEXT, client_slug TEXT, detail TEXT);
  `);
  const kw = db.prepare("INSERT INTO citation_keywords (id, client_slug, keyword) VALUES (?, ?, ?)");
  for (let i = 1; i <= 30; i++) kw.run(i, "client-a", `q${i}`);
  kw.run(99, "client-b", "other client");

  const run = db.prepare("INSERT INTO citation_runs (keyword_id, engine, client_cited, run_at) VALUES (?, ?, ?, ?)");
  const days: string[] = [];
  for (let d = 1; d <= 30; d++) days.push(`2026-09-${String(d).padStart(2, "0")}`);
  days.push("2026-10-01", "2026-10-02", "2026-10-03");
  for (const day of days) {
    for (let k = 1; k <= 30; k++) {
      const added = k > 18;
      if (added && (day === "2026-09-01" || day === "2026-09-24")) continue;
      for (const e of ENGINES) run.run(k, e, k % 3 === 0 ? 1 : 0, ts(day));
    }
    run.run(99, "perplexity", 1, ts(day));
  }

  const ev = db.prepare("INSERT INTO instrument_events (occurred_at, kind, scope, engine, client_slug, detail) VALUES (?, ?, ?, ?, ?, ?)");
  ev.run(ts("2026-09-23", 0), "question_set_changed", "client", null, "client-a", "lost 12");
  ev.run(ts("2026-09-24", 0), "question_set_changed", "client", null, "client-a", "restored 12");
  ev.run(ts("2026-09-23", 0), "snapshot_overwritten", "global", null, null, "bridge");
  ev.run(ts("2026-09-10", 0), "unexplained_step", "engine", "gemini", "client-b", "someone else's step");
  ev.run(ts("2026-08-23", 0), "engine_adapter_changed", "engine", "perplexity", null, "before both windows");
  return db;
}

test("the stable core is the 18 that ran every day, not the 30", async () => {
  const r = await loadStableCoreCounts(d1(fixture()), "client-a", SEP, OCT);
  assert.deepEqual(r.keywordIds, Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(r.excludedKeywordIds.length, 12);
  assert.equal(r.measuredDays, 33);
});

test("counts come from the core only, and never from another client", async () => {
  const r = await loadStableCoreCounts(d1(fixture()), "client-a", SEP, OCT);
  const p = r.perSurface.find((s) => s.engine === "perplexity")!;
  // 18 questions x 30 days in September, 18 x 3 in October, one run each.
  assert.equal(p.prevRuns, 18 * 30);
  assert.equal(p.curRuns, 18 * 3);
  // Questions 3, 6, ... 18 cite: 6 of the 18.
  assert.equal(p.prevHits, 6 * 30);
  assert.equal(p.curHits, 6 * 3);
});

test("a client measured in only one window has no core at all", async () => {
  const db = fixture();
  db.exec(`DELETE FROM citation_runs WHERE run_at >= ${OCT.start}`);
  const r = await loadStableCoreCounts(d1(db), "client-a", SEP, OCT);
  assert.deepEqual(r.keywordIds, []);
  assert.deepEqual(r.perSurface, []);
});

test("a client's events load with global ones and without other clients' steps", async () => {
  const ev = await loadInstrumentEvents(d1(fixture()), SEP, OCT, "client-a");
  assert.deepEqual(ev.map((e) => e.kind).sort(), ["question_set_changed", "question_set_changed", "snapshot_overwritten"]);
});

test("a fleet-wide load includes every client's events, but nothing outside the span", async () => {
  const ev = await loadInstrumentEvents(d1(fixture()), SEP, OCT, null);
  assert.equal(ev.length, 4);
  assert.ok(!ev.some((e) => e.kind === "engine_adapter_changed"), "08-23 is before both windows");
});

test("end to end: the decided comparison is stated, with every event accounted for", async () => {
  const env = d1(fixture());
  const counts = await loadStableCoreCounts(env, "client-a", SEP, OCT);
  const events = await loadInstrumentEvents(env, SEP, OCT, "client-a");
  const c = computeComparison({
    basis: "stable_core",
    sharedKeywords: counts.keywordIds.length,
    perSurface: counts.perSurface,
    prevWindow: SEP,
    curWindow: OCT,
    events,
  });
  // Volume differs by design (30 days vs 3), so the pools withhold on volume.
  // What matters here is that no EVENT withholds: all three are set aside.
  assert.equal(c.events.length, 0);
  assert.equal(c.setAside.length, 3);
  for (const s of c.perSurface) assert.equal(s.movement.kind, "stated", `${s.engine} should be stated`);
  assert.equal(c.basis.sharedKeywords, 18);
});

test("the same data on the shared basis is still refused by the question-set change", async () => {
  const env = d1(fixture());
  const counts = await loadStableCoreCounts(env, "client-a", SEP, OCT);
  const c = computeComparison({
    sharedKeywords: counts.keywordIds.length,
    perSurface: counts.perSurface,
    prevWindow: SEP,
    curWindow: OCT,
    events: await loadInstrumentEvents(env, SEP, OCT, "client-a"),
  });
  assert.equal(c.events.length, 2);
  for (const s of c.perSurface) assert.equal(s.movement.kind, "withheld");
});

test("the weekly brief passes events, and an unreadable table withholds rather than clears", () => {
  const src = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");
  assert.match(src, /loadInstrumentEvents\(/);
  assert.match(src, /prevWindow: \{ start: prevStart, end: prevEnd \},\s*events,/);
  assert.match(src, /kind: "events_unavailable"/);
  assert.match(src, /setAside/);
});

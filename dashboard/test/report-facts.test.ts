import { test } from "node:test";
import assert from "node:assert";
import { buildReportFacts, emitReportFacts } from "../src/lib/report-facts.ts";

// Fake env whose first() returns the right row per query (by SQL shape).
// gridRuns (optional) are returned ONLY for the citation-grid query (its SELECT
// omits cr.run_at); the question-movement query gets [] so it stays absent.
function fakeEnv(snap: any, cust: any, prior: any, gridRuns: any[] = []) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (/citation_snapshots/.test(sql)) return snap;
                if (/FROM customers/.test(sql)) return cust;
                if (/monthly_memos/.test(sql)) return prior;
                return null;
              },
              async all() {
                // buildQuestionMovement selects "cr.run_at, ck.keyword"; the grid
                // query does not. Route run rows to the grid query only.
                if (/cr\.run_at, ck\.keyword/.test(sql)) return { results: [] };
                return { results: gridRuns };
              },
            };
          },
        };
      },
    },
  } as any;
}

test("buildReportFacts derives all four chart datasets from snapshot + prior facts", async () => {
  const snap = {
    engines_breakdown: JSON.stringify({ Claude: { share_pct: 15 }, "Microsoft Copilot": { share_pct: 1 } }),
    top_competitors: JSON.stringify({
      htc_venue_share_pct: 48,
      competitors: [{ label: "Diamond Head Theatre", venue_share_pct: 15 }],
      source_types: { independent_web: { share_pct: 69 }, owned: { share_pct: 9 } },
      offsite_hosts: [{ host: "gohawaii.com", share_pct: 3 }],
    }),
    // Measured inside the delivery month. Real reports carry data from the
    // delivery month or the one before it; the guard fails closed past that.
    measured_at: Math.floor(Date.UTC(2026, 6, 15) / 1000), // Jul 15, 2026
  };
  const prior = { month_key: "2026-06", facts_json: JSON.stringify({ engines: [{ name: "Claude", pct: 14 }, { name: "Microsoft Copilot", pct: 0 }] }) };
  const facts = await buildReportFacts(fakeEnv(snap, { name: "Hawaii Theatre Center" }, prior), "hawaii-theatre", "2026-07");
  assert.ok(facts);
  assert.equal(facts!.period_label, "Jul 2026");
  assert.equal(facts!.prior_label, "Jun 2026");
  const claude = facts!.engines.find((e) => e.name === "Claude")!;
  assert.equal(claude.pct, 15);
  assert.equal(claude.prev, 14); // prev pulled from prior report
  const copilot = facts!.engines.find((e) => e.name === "Microsoft Copilot")!;
  assert.equal(copilot.prev, 0); // off zero comparison preserved
  assert.equal(facts!.venue.rows[0].label, "Hawaii Theatre Center");
  assert.equal(facts!.venue.rows[0].you, true);
  assert.equal(facts!.venue.rows[0].pct, 48);
  const own = facts!.sources.find((s) => s.own)!;
  assert.equal(own.label, "Your own site");
  assert.equal(facts!.sources[0].label, "Independent web"); // sorted desc (69 first)
  assert.equal(facts!.topSources[0].host, "gohawaii.com");
});

test("buildReportFacts returns null with no snapshot", async () => {
  assert.equal(await buildReportFacts(fakeEnv(null, null, null), "x", "2026-07"), null);
});

test("buildReportFacts: baseline (no prior report) leaves engines without prev", async () => {
  const snap = {
    engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }),
    top_competitors: "{}",
    measured_at: Math.floor(Date.UTC(2026, 5, 15) / 1000), // Jun 15, 2026
  };
  const facts = await buildReportFacts(fakeEnv(snap, { name: "X" }, null), "x", "2026-06");
  assert.equal(facts!.engines[0].prev, undefined);
  assert.equal(facts!.prior_label, undefined);
});

test("buildReportFacts refuses a legacy-shape snapshot (no share_pct) -> null", async () => {
  const legacy = {
    engines_breakdown: JSON.stringify({ google_ai_overview: { queries: 10, citations: 2 } }),
    top_competitors: JSON.stringify([{ name: "X", count: 5 }]),
  };
  assert.equal(await buildReportFacts(fakeEnv(legacy, { name: "X" }, null), "x", "2026-07"), null);
});

const okSnap = {
  engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }),
  top_competitors: "{}",
  measured_at: Math.floor(Date.UTC(2026, 6, 15) / 1000), // Jul 15, 2026
};

test("buildCitationGrid: aggregates client_cited per engine x question, canonical order", async () => {
  const runs = [
    // perplexity: q1 cited 2/2, q2 0/2, q3 never answered
    { engine: "perplexity", client_cited: 1, keyword: "q1" },
    { engine: "perplexity", client_cited: 1, keyword: "q1" },
    { engine: "perplexity", client_cited: 0, keyword: "q2" },
    { engine: "perplexity", client_cited: 0, keyword: "q2" },
    // anthropic (Claude): q1 1/2, q2 0/1, q3 2/2
    { engine: "anthropic", client_cited: 1, keyword: "q1" },
    { engine: "anthropic", client_cited: 0, keyword: "q1" },
    { engine: "anthropic", client_cited: 0, keyword: "q2" },
    { engine: "anthropic", client_cited: 1, keyword: "q3" },
    { engine: "anthropic", client_cited: 1, keyword: "q3" },
  ];
  const facts = await buildReportFacts(fakeEnv(okSnap, { name: "X" }, null, runs), "x", "2026-07");
  const grid = facts!.grid!;
  assert.ok(grid, "grid present");
  // Canonical 5+2 order: perplexity before anthropic.
  assert.deepEqual(grid.engines, ["Perplexity", "Claude"]);
  assert.deepEqual(grid.questions, ["q1", "q2", "q3"]); // sorted, stable
  // perplexity row: q1=1, q2=0, q3=-1 (never answered -> no claim)
  assert.deepEqual(grid.cells[0], [1, 0, -1]);
  // claude row: q1=0.5, q2=0, q3=1
  assert.deepEqual(grid.cells[1], [0.5, 0, 1]);
});

test("buildCitationGrid: fail-closed below 2 engines or 3 questions", async () => {
  // Only one engine -> no grid.
  const oneEngine = [
    { engine: "perplexity", client_cited: 1, keyword: "q1" },
    { engine: "perplexity", client_cited: 1, keyword: "q2" },
    { engine: "perplexity", client_cited: 1, keyword: "q3" },
  ];
  const f1 = await buildReportFacts(fakeEnv(okSnap, { name: "X" }, null, oneEngine), "x", "2026-07");
  assert.equal(f1!.grid, undefined);
  // Two engines but only two questions -> no grid.
  const twoQ = [
    { engine: "perplexity", client_cited: 1, keyword: "q1" },
    { engine: "anthropic", client_cited: 1, keyword: "q2" },
  ];
  const f2 = await buildReportFacts(fakeEnv(okSnap, { name: "X" }, null, twoQ), "x", "2026-07");
  assert.equal(f2!.grid, undefined);
});

test("buildReportFacts refuses a snapshot newer than the report month -> null", async () => {
  const snap = {
    engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }),
    top_competitors: "{}",
    week_start: Math.floor(Date.UTC(2026, 8, 1) / 1000), // Sep 1, 2026
  };
  // Report labeled July but the only snapshot is from September: fail closed.
  assert.equal(await buildReportFacts(fakeEnv(snap, { name: "X" }, null), "x", "2026-07"), null);
});

// --- measurement staleness (migration 0106 / measured_at) -------------------
//
// monthKey is the DELIVERY month. memo-generator.ts tells the model to title
// the memo by the delivery month and explicitly NOT by the month the data
// falls in, so correct reports always carry data older than their label.
// Any guard here has to separate "one month back, as the cadence intends"
// from "a stale snapshot wearing a fresh date".

const staleSnapBase = {
  engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }),
  top_competitors: "{}",
};

test("refuses a snapshot measured months before the delivery month -> null", async () => {
  // The prince-waikiki shape: measured 2026-06-26, first readout ships
  // September. week_start said 2026-08-17 (the bridge stamped its own run
  // date), so the newer-than guard saw nothing wrong. Only measured_at does.
  const snap = {
    ...staleSnapBase,
    week_start: Math.floor(Date.UTC(2026, 7, 17) / 1000), // Aug 17 -- looks current
    measured_at: Math.floor(Date.UTC(2026, 5, 26) / 1000), // Jun 26 -- the truth
  };
  assert.equal(
    await buildReportFacts(fakeEnv(snap, { name: "Prince Waikiki" }, null), "prince-waikiki", "2026-09"),
    null,
  );
});

test("ACCEPTS data from the month before the delivery month", async () => {
  // The hawaii-theatre shape: August report, measured July 31. This is the
  // cadence working, not a defect. A same-month rule would fail closed here
  // and take every correct report down with it -- this test exists to stop
  // that fix from being written.
  const snap = {
    ...staleSnapBase,
    week_start: Math.floor(Date.UTC(2026, 6, 27) / 1000),
    measured_at: Math.floor(Date.UTC(2026, 6, 31) / 1000), // Jul 31, 2026
  };
  const facts = await buildReportFacts(fakeEnv(snap, { name: "Hawaii Theatre Center" }, null), "hawaii-theatre", "2026-08");
  assert.ok(facts, "July data must still produce facts for an August report");
  assert.equal(facts!.engines[0].name, "Claude");
});

test("refuses a snapshot that cannot prove when it was measured -> null", async () => {
  // measured_at NULL means unknown, and unknown is not a reason to trust a
  // row. Fail closed, matching every other guard in this function.
  const snap = { ...staleSnapBase, week_start: Math.floor(Date.UTC(2026, 6, 27) / 1000), measured_at: null };
  assert.equal(await buildReportFacts(fakeEnv(snap, { name: "X" }, null), "x", "2026-08"), null);
});

// --- delivery is final (emitReportFacts) ------------------------------------
//
// The readout footer promises the numbers do not change after delivery.
// The old skip required delivered_at AND facts_json to be set, and the
// UPDATE's WHERE said `(delivered_at IS NULL OR facts_json IS NULL)` -- so a
// DELIVERED narrative-only report satisfied both and got charts written to it
// after the customer had already received it. hawaii-theatre's August 2026
// report: delivered 08-03 20:08, facts_json written 08-04 07:49.

/** Fake env for emitReportFacts. Records every UPDATE it attempts. */
function emitEnv(memoRow: any, snap: any, updates: string[]) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: any[]) {
            return {
              async first() {
                if (/FROM monthly_memos/.test(sql) && /delivered_at, facts_json/.test(sql)) return memoRow;
                if (/citation_snapshots/.test(sql)) return snap;
                if (/FROM customers/.test(sql)) return { name: "Hawaii Theatre Center", category_label: null };
                return null;
              },
              async all() { return { results: [] }; },
              async run() {
                if (/^UPDATE monthly_memos/.test(sql.trim())) updates.push(sql);
                return { success: true };
              },
            };
          },
        };
      },
    },
  } as any;
}

const deliverableSnap = {
  engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }),
  top_competitors: "{}",
  week_start: Math.floor(Date.UTC(2026, 6, 27) / 1000),
  measured_at: Math.floor(Date.UTC(2026, 6, 31) / 1000), // Jul 31 -> valid for August
};

test("a DELIVERED narrative-only report never gains facts afterwards", async () => {
  const updates: string[] = [];
  const delivered = { delivered_at: Math.floor(Date.UTC(2026, 7, 3, 20, 8) / 1000), facts_json: null };
  const ok = await emitReportFacts(emitEnv(delivered, deliverableSnap, updates), "hawaii-theatre", "2026-08");
  assert.equal(ok, false, "must refuse to emit for a delivered report");
  assert.deepEqual(updates, [], "must not attempt any UPDATE on a delivered report");
});

test("an undelivered report still gets its facts written", async () => {
  const updates: string[] = [];
  const undelivered = { delivered_at: null, facts_json: null };
  const ok = await emitReportFacts(emitEnv(undelivered, deliverableSnap, updates), "hawaii-theatre", "2026-08");
  assert.equal(ok, true, "an undelivered report must still be written");
  assert.equal(updates.length, 1);
  assert.match(updates[0], /delivered_at IS NULL/, "the race backstop must match the early skip");
});

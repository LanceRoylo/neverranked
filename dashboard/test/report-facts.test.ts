import { test } from "node:test";
import assert from "node:assert";
import { buildReportFacts } from "../src/lib/report-facts.ts";

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
  const snap = { engines_breakdown: JSON.stringify({ Claude: { share_pct: 14 } }), top_competitors: "{}" };
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

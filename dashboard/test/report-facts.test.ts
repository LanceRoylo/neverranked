import { test } from "node:test";
import assert from "node:assert";
import { buildReportFacts } from "../src/lib/report-facts.ts";

// Fake env whose first() returns the right row per query (by SQL shape).
function fakeEnv(snap: any, cust: any, prior: any) {
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

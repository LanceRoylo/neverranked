import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportFacts } from "../src/lib/report-facts.ts";

/**
 * The two measurement layers must stay distinguishable all the way from the
 * snapshot to the rendered chart. If `layer` is dropped anywhere in between,
 * the readout puts a share of CITED SOURCES and a share of ANSWERS on one
 * axis under the caption "the share of that AI tool's citations that point to
 * your own site", which is false for the model-knowledge tools.
 *
 * See neverranked-docs/CLAIMS-VS-CODE-AUDIT-2026-09-06.md findings 2 and 5.
 */

function fakeEnv(snap: unknown) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (/citation_snapshots/.test(sql)) return snap;
                if (/FROM customers/.test(sql)) return { name: "Prince Waikiki" };
                return null;
              },
              async all() {
                return { results: [] };
              },
            };
          },
        };
      },
    },
  } as never;
}

const MEASURED = Math.floor(Date.UTC(2026, 8, 20) / 1000); // Sep 20 2026

const SWEEP_SNAP = {
  engines_breakdown: JSON.stringify({
    Perplexity: { citations: 62, total: 3381, share_pct: 2, layer: "citation" },
    Gemma: { citations: 40, total: 228, share_pct: 18, layer: "model_knowledge" },
    Claude: { citations: 0, total: 224, share_pct: 0, layer: "model_knowledge" },
  }),
  top_competitors: JSON.stringify({ htc_venue_share_pct: 12, competitors: [] }),
  measured_at: MEASURED,
};

// Every bridge-written row. No `layer` key at all.
const BRIDGE_SNAP = {
  engines_breakdown: JSON.stringify({
    Perplexity: { citations: 266, total: 2428, share_pct: 11 },
    Claude: { citations: 98, total: 741, share_pct: 13 },
  }),
  top_competitors: JSON.stringify({ htc_venue_share_pct: 63, competitors: [] }),
  measured_at: MEASURED,
};

test("layer survives the snapshot -> ReportFacts hop", async () => {
  const f = await buildReportFacts(fakeEnv(SWEEP_SNAP), "prince-waikiki", "2026-09");
  assert.ok(f);
  const byName = new Map(f!.engines.map((e) => [e.name, e]));
  assert.equal(byName.get("Perplexity")!.layer, undefined, "citation-grade carries no tag");
  assert.equal(byName.get("Gemma")!.layer, "model_knowledge");
  assert.equal(byName.get("Claude")!.layer, "model_knowledge");
});

test("the real September split lands on the right side of the line", async () => {
  const f = await buildReportFacts(fakeEnv(SWEEP_SNAP), "prince-waikiki", "2026-09");
  const cited = f!.engines.filter((e) => e.layer !== "model_knowledge");
  const named = f!.engines.filter((e) => e.layer === "model_knowledge");
  assert.equal(cited.length, 1);
  assert.equal(named.length, 2);
  // Gemma at 18% is the number that was being stored as 0 before the
  // business-name fix. If this reads 0 again, the regression is back.
  assert.equal(named.find((e) => e.name === "Gemma")!.pct, 18);
  // Claude's 0 is a REAL absence, not the artifact. It must stay 0.
  assert.equal(named.find((e) => e.name === "Claude")!.pct, 0);
});

test("a bridge snapshot with no layer key renders entirely as citation-grade", async () => {
  // hawaii-theatre must be untouched by all of this. An accidental default of
  // "model_knowledge" would silently move their Claude bar into a second
  // chart with a different caption, mid-engagement.
  const f = await buildReportFacts(fakeEnv(BRIDGE_SNAP), "hawaii-theatre", "2026-09");
  assert.ok(f);
  assert.equal(f!.engines.length, 2);
  for (const e of f!.engines) {
    assert.equal(e.layer, undefined, `${e.name} acquired a layer it never had`);
  }
});

test("an unrecognized layer value is not trusted into the model-knowledge group", async () => {
  const weird = {
    ...SWEEP_SNAP,
    engines_breakdown: JSON.stringify({
      Perplexity: { share_pct: 2, layer: "citation" },
      Gemma: { share_pct: 18, layer: "MODEL_KNOWLEDGE" },
      Claude: { share_pct: 0, layer: 7 },
    }),
  };
  const f = await buildReportFacts(fakeEnv(weird), "prince-waikiki", "2026-09");
  // Only the exact literal counts. Anything else falls back to citation-grade,
  // which is the conservative direction: it keeps the tool in the chart whose
  // caption the older pipeline already validated.
  for (const e of f!.engines) assert.equal(e.layer, undefined);
});

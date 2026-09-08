import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEnginesBreakdown } from "../src/citations.ts";

// Companion to citation-digest-shape.test.ts. That file covers
// top_competitors; this one covers engines_breakdown, which carries the same
// two-shape problem and was still unguarded in three readers on 2026-09-06:
//
//   routes/citations.ts  buildEngineRows read `data.queries`, absent from
//                        readout rows, and printed the literal string
//                        "undefined" into a customer-visible table.
//   routes/competitors.ts typed the column as an ARRAY, which neither writer
//                        has ever produced, so its engine block rendered
//                        nothing for every client since it was written.
//
// Fixtures are copied from production rows, so these fail if either writer
// changes shape again.

const LEGACY_EB = JSON.stringify({
  perplexity: { queries: 229, citations: 39 },
  bing: { queries: 226, citations: 0 },
  google_ai_overview: { queries: 94, citations: 11 },
});

const READOUT_EB = JSON.stringify({
  Perplexity: { citations: 266, total: 2428, share_pct: 11, cohort_citations: 333 },
  "ChatGPT search": { citations: 253, total: 1851, share_pct: 14, cohort_citations: 295 },
  "Bing search (control)": { citations: 1, total: 767, share_pct: 0, cohort_citations: 1 },
});

test("legacy shape: queries becomes the denominator", () => {
  const rows = normalizeEnginesBreakdown(LEGACY_EB);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { engine: "perplexity", cited: 39, total: 229 });
  assert.deepEqual(rows[1], { engine: "bing", cited: 0, total: 226 });
});

test("readout shape: total becomes the denominator, labels preserved verbatim", () => {
  const rows = normalizeEnginesBreakdown(READOUT_EB);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { engine: "Perplexity", cited: 266, total: 2428 });
  // The display label must survive untouched -- report-facts joins the prior
  // month's engine values by NAME, so a mangled label silently drops the
  // dumbbell's "from" dots rather than failing loudly.
  assert.deepEqual(rows[1], { engine: "ChatGPT search", cited: 253, total: 1851 });
});

test("no reader can produce NaN or undefined from either shape", () => {
  for (const raw of [LEGACY_EB, READOUT_EB]) {
    for (const r of normalizeEnginesBreakdown(raw)) {
      assert.ok(Number.isFinite(r.cited), `cited not finite for ${r.engine}`);
      assert.ok(Number.isFinite(r.total), `total not finite for ${r.engine}`);
      assert.equal(typeof r.engine, "string");
      assert.notEqual(r.engine, "");
    }
  }
});

test("a zero-citation engine survives rather than being filtered out", () => {
  // Bing organic is the control and legitimately reads 0. Dropping it would
  // hide the control from the very chart that exists to show it.
  const rows = normalizeEnginesBreakdown(READOUT_EB);
  const bing = rows.find((r) => r.engine === "Bing search (control)");
  assert.ok(bing, "control engine must not be dropped");
  assert.equal(bing.cited, 1);
  assert.equal(bing.total, 767);
});

test("empty / null / malformed / array degrade to [] rather than throwing", () => {
  assert.deepEqual(normalizeEnginesBreakdown("{}"), []);
  assert.deepEqual(normalizeEnginesBreakdown(""), []);
  assert.deepEqual(normalizeEnginesBreakdown(null), []);
  assert.deepEqual(normalizeEnginesBreakdown("not json"), []);
  // An array is neither writer's shape; degrade rather than half-parse.
  assert.deepEqual(normalizeEnginesBreakdown("[{\"engine\":\"x\"}]"), []);
});

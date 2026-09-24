/* `layer` is the provenance fingerprint on a readout snapshot.
 *
 * buildReadoutSnapshot writes it on EVERY engine, on both branches, and has
 * since 2026-09-08. The forensic bridge writes share_pct and cohort_citations
 * and never writes layer. So a stored snapshot without it did not come from
 * the Worker.
 *
 * That is how 2026-09-23 was diagnosed: both live clients' only snapshots had
 * no layer key at all, and their measured_at matched the two bridge executions
 * to the second. Every figure in both September memos derived from rows the
 * bridge had written from laptop disk files, over the top of what the Worker
 * wrote that Monday. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CITATIONS = fs.readFileSync(new URL("../src/citations.ts", import.meta.url), "utf8");
const ROUTES = fs.readFileSync(new URL("../src/routes/admin-memos.ts", import.meta.url), "utf8");
const INDEX = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("the Worker stamps layer on both engine branches", () => {
  assert.match(CITATIONS, /layer: "citation"/, "retrieving surfaces must be stamped");
  assert.match(CITATIONS, /layer: "model_knowledge"/, "recalling surfaces must be stamped");
});

test("the snapshot is written without a remapping step that could drop layer", () => {
  // JSON.stringify(enginesBreakdown) straight into the INSERT. A mapping layer
  // here is how the fingerprint would silently stop being written.
  assert.match(CITATIONS, /JSON\.stringify\(enginesBreakdown\)/);
});

test("one client's snapshot can be rebuilt without running the weekly workflow", () => {
  // The only caller used to be weekly-extras, which also fires a replicate
  // sweep, a GSC pull, a backup and a Reddit check.
  assert.match(ROUTES, /export async function handleRebuildSnapshot/);
  assert.ok(INDEX.includes("admin") && INDEX.includes("snapshots") && INDEX.includes("rebuild$"),
    "index.ts must route the rebuild path");
  assert.match(INDEX, /handleRebuildSnapshot/, "and dispatch to the handler");
});

test("the rebuild is admin-only and POST-only", () => {
  const i = INDEX.indexOf("/rebuild$/");
  assert.ok(i > 0);
  const near = INDEX.slice(i, i + 260);
  assert.match(near, /method === "POST"/);
  assert.match(near, /user\.role === "admin"/);
});

test("the rebuild reports provenance before and after, and does not swallow a refusal", () => {
  assert.match(ROUTES, /instr\(engines_breakdown,'layer'\)/,
    "provenance must be read from the stored row, not assumed");
  assert.match(ROUTES, /Refused: /, "a guard refusal must be shown, not reported as success");
  assert.match(ROUTES, /const wrote = res\.ok && !!after\?\.has_layer/,
    "success requires the rebuilt row to actually carry Worker provenance");
});

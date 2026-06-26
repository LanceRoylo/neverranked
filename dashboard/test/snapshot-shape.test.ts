import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isReadoutShapeSnapshot } from "../src/lib/snapshot-shape";

// Real readout-shape (mirrors the production hawaii-theatre row).
const READOUT_EB = JSON.stringify({
  "Claude": { citations: 104, total: 740, share_pct: 14 },
  "Perplexity": { citations: 180, total: 1438, share_pct: 13 },
  "Microsoft Copilot": { citations: 0, total: 804, share_pct: 0 },
});
const READOUT_TC = JSON.stringify({
  htc_venue_share_pct: 47, htc_engines_count: 6,
  competitors: [{ domain: "diamondheadtheatre.com", label: "Diamond Head Theatre", citations: 230, venue_share_pct: 16, engines_count: 5 }],
});

// Legacy shape (what buildClientSnapshot / runWeeklyCitations emit).
const LEGACY_EB = JSON.stringify({
  "google_ai_overview": { queries: 12, citations: 3 },
  "bing": { queries: 12, citations: 0 },
});
const LEGACY_TC = JSON.stringify([{ name: "diamond head theatre", count: 9 }]);

test("readout shape is recognized (engines share_pct signal)", () => {
  assert.equal(isReadoutShapeSnapshot(READOUT_EB, READOUT_TC), true);
});

test("readout shape recognized from engines alone", () => {
  assert.equal(isReadoutShapeSnapshot(READOUT_EB, undefined), true);
});

test("readout shape recognized from top_competitors alone (no share in eb)", () => {
  assert.equal(isReadoutShapeSnapshot("{}", READOUT_TC), true);
});

test("legacy shape is rejected", () => {
  assert.equal(isReadoutShapeSnapshot(LEGACY_EB, LEGACY_TC), false);
});

test("legacy engines + array competitors rejected", () => {
  assert.equal(isReadoutShapeSnapshot(LEGACY_EB, "[]"), false);
});

test("empty / null / malformed are rejected (no false positives)", () => {
  assert.equal(isReadoutShapeSnapshot("{}", "{}"), false);
  assert.equal(isReadoutShapeSnapshot(null, null), false);
  assert.equal(isReadoutShapeSnapshot(undefined), false);
  assert.equal(isReadoutShapeSnapshot("not json", "also not json"), false);
  assert.equal(isReadoutShapeSnapshot("[]", "[]"), false);
});

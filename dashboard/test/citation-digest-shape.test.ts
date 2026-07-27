import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTopCompetitors, normalizeKeywordCounts } from "../src/citations.ts";

// Regression guard for the 2026-07-27 finding: citation_snapshots holds two
// JSON shapes in top_competitors / keyword_breakdown, and getCitationDigestData
// assumed the legacy array. From 2026-07-02 the weekly digest for
// hawaii-theatre died every Monday on
// "TypeError: topCompetitors.slice is not a function".
//
// The fixtures below are copied verbatim from production rows, so these tests
// fail if either writer changes shape again.

const LEGACY_TC = '[{"name":"youtube","count":24},{"name":"changethroughplay.co","count":9}]';
const LEGACY_KB = '[{"keyword":"a","cited":true},{"keyword":"b","cited":false},{"keyword":"c","cited":true}]';

const READOUT_TC = JSON.stringify({
  htc_venue_share_pct: 48,
  htc_engines_count: 7,
  competitors: [
    { domain: "diamondheadtheatre.com", label: "Diamond Head Theatre", citations: 217, venue_share_pct: 15, engines_count: 5 },
    { domain: "blaisdellcenter.com", label: "Blaisdell Center", citations: 196, venue_share_pct: 14, engines_count: 5 },
  ],
});
const READOUT_KB = JSON.stringify({ questions_with_owned: 18, total_questions: 18 });

test("legacy array shape still parses (no regression for and-scene / neverranked)", () => {
  const tc = normalizeTopCompetitors(LEGACY_TC);
  assert.deepEqual(tc, [
    { name: "youtube", count: 24 },
    { name: "changethroughplay.co", count: 9 },
  ]);
  assert.deepEqual(normalizeKeywordCounts(LEGACY_KB), { won: 2, lost: 1, total: 3 });
});

test("readout object shape parses instead of throwing (the hawaii-theatre crash)", () => {
  const tc = normalizeTopCompetitors(READOUT_TC);
  assert.equal(tc.length, 2);
  assert.deepEqual(tc[0], { name: "Diamond Head Theatre", count: 217 });
  assert.deepEqual(normalizeKeywordCounts(READOUT_KB), { won: 18, lost: 0, total: 18 });
});

test("readout shape yields a REAL digest, not an empty one", () => {
  // The point of normalizing rather than merely guarding: HTC should get
  // competitor rows, not a blank section.
  assert.ok(normalizeTopCompetitors(READOUT_TC).length > 0);
  assert.ok(normalizeKeywordCounts(READOUT_KB).total > 0);
});

test("unrecognized / malformed input degrades to empty instead of throwing", () => {
  for (const bad of ['{"competitors":"nope"}', "{}", "[]", "null", "not json", "", null, undefined]) {
    assert.deepEqual(normalizeTopCompetitors(bad as unknown), []);
    assert.deepEqual(normalizeKeywordCounts(bad as unknown), { won: 0, lost: 0, total: 0 });
  }
});

test("entries missing a usable name are dropped, not rendered blank", () => {
  const tc = normalizeTopCompetitors('[{"count":5},{"name":"real","count":2},{"name":"  ","count":1}]');
  assert.deepEqual(tc, [{ name: "real", count: 2 }]);
});

test("non-numeric counts become 0 rather than NaN in the email", () => {
  const tc = normalizeTopCompetitors('[{"name":"x","count":"lots"}]');
  assert.deepEqual(tc, [{ name: "x", count: 0 }]);
});

test("questions_with_owned above total never yields a negative lost count", () => {
  assert.deepEqual(
    normalizeKeywordCounts(JSON.stringify({ questions_with_owned: 25, total_questions: 18 })),
    { won: 25, lost: 0, total: 18 },
  );
});

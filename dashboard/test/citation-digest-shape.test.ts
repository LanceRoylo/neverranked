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

// ── Vocabulary discipline (added 2026-08-10) ────────────────────────────
//
// The digest grader held EVERY weekly digest from 2026-08-02 onward, and
// it was right each time: keywordsWon is COVERAGE (queries where the
// client is cited at all, a stock) and keywordsLost is simply
// total-minus-won, yet the prose rendered them as weekly flows ("earned
// 18 new AI citations this week", "lost 5 citations this week") beside a
// share figure with a different denominator. "18 of 18" next to "8%"
// with one word for both reads as a contradiction because, as written,
// it was one. Delivered digests: zero, for three months.
//
// Source-level assertion, same pattern as the outreach canon tests: the
// false flow-language must not reappear anywhere in the digest builders.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));

test("digest prose never renders coverage counts as weekly gained/lost flows", () => {
  const src = readFileSync(join(HERE, "..", "src", "email.ts"), "utf8");
  const falseFlow = /(gained|earned|lost) \$\{[^}]*keywords(Won|Lost)[^}]*\}[^`]{0,40}(citation|this week)/i;
  const m = src.match(falseFlow);
  assert.equal(
    m,
    null,
    `email.ts renders a coverage stock as a weekly flow again: "${m?.[0]}". ` +
      "keywordsWon/Lost are cited/uncited counts RIGHT NOW, not deltas — " +
      "label them as coverage or the grader will (correctly) hold every digest.",
  );
});

test("the citation card labels both denominators", () => {
  const src = readFileSync(join(HERE, "..", "src", "email.ts"), "utf8");
  assert.ok(
    /of every citation across all tracked queries/.test(src),
    "the share figure lost its denominator caption",
  );
  assert.ok(
    /Coverage: appears in answers for/.test(src),
    "the coverage line lost its label — a bare 'Cited in N of M' beside a share % is the exact ambiguity the grader holds",
  );
});

// ── The grader must read what the recipient renders ─────────────────────
import { htmlToPlaintext } from "../src/digest-grader";

test("template comments never reach the graded text", () => {
  // Round-4 hold (2026-08-10): a developer comment containing
  // "/actions/<slug> surface where the work happens" leaked its tail into
  // the plaintext because the naive tag regex ate the comment only up to
  // the first ">" inside it. The grader quoted a broken sentence no
  // recipient ever saw.
  const html = `<div>Scan August 11, 2026</div><!-- CTA links into the /actions/<slug> surface where the work happens. --><h2>Next section</h2>`;
  const text = htmlToPlaintext(html);
  assert.ok(!text.includes("where the work happens"), "comment text leaked into graded plaintext");
  assert.ok(!text.includes("-->"), "comment delimiter leaked");
});

test("block boundaries survive as line breaks so structure is gradable", () => {
  // Collapsing all whitespace flattened the whole email into one line,
  // and a grader handed one unbroken line reads 'unstructured data dump'
  // regardless of how the email renders.
  const html = `<p>First paragraph.</p><p>Second paragraph.</p><div>Third block.</div>`;
  const text = htmlToPlaintext(html);
  assert.ok(text.includes("\n"), "no line structure at all");
  assert.match(text, /First paragraph\.\s*\n/, "paragraph boundary lost");
});

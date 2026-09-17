import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { namedInAnswer, presenceStats, looksTruncated, RESPONSE_TEXT_CAP, capForRun, RESPONSE_TEXT_CAP_RAISED_AT, nameIsSqlSafe, buildPresenceSql, toEnginePresence } from "../src/lib/answer-presence";

const NAME = "Prince Waikiki";

test("a plain mention is found", () => {
  assert.equal(namedInAnswer({ text: "I'd recommend Prince Waikiki for that.", businessName: NAME }), true);
});

test("case and surrounding punctuation do not matter", () => {
  assert.equal(namedInAnswer({ text: "Try **PRINCE WAIKIKI**, it's great.", businessName: NAME }), true);
  assert.equal(namedInAnswer({ text: "1. Prince Waikiki — oceanfront", businessName: NAME }), true);
});

test("a line break inside the name still matches", () => {
  assert.equal(namedInAnswer({ text: "Consider Prince\n  Waikiki for this.", businessName: NAME }), true);
});

test("a longer official name containing it matches", () => {
  assert.equal(namedInAnswer({ text: "The Prince Waikiki Hotel has ocean views.", businessName: NAME }), true);
});

test("a complete answer that does not name it is a measured no", () => {
  assert.equal(namedInAnswer({ text: "Halekulani and the Royal Hawaiian are best.", businessName: NAME }), false);
});

// ── The false-positive this design exists to avoid ────────────────────────

test("a fragment of the name is not the name", () => {
  // "Waikiki" appears in nearly every Honolulu hotel answer. If a bare fragment
  // counted, this client would score near 100% and the metric would be worthless.
  assert.equal(namedInAnswer({ text: "Waikiki has many good hotels.", businessName: NAME }), false);
  assert.equal(namedInAnswer({ text: "Prince Kuhio Avenue runs through it.", businessName: NAME }), false);
});

test("a name is not matched inside a longer word", () => {
  // The boundary rule. A substring test with no boundary matches "Kai" in
  // "Kailua", which is a different business in the same town.
  assert.equal(namedInAnswer({ text: "Kailua Beach is on the windward side.", businessName: "Kai Restaurant" }), false);
  assert.equal(namedInAnswer({ text: "We went to Kai Restaurant.", businessName: "Kai Restaurant" }), true);
});

test("names shorter than four characters are never evidence", () => {
  assert.equal(namedInAnswer({ text: "The Pig is a bar downtown.", businessName: "Pig" }), false);
});

// ── The third state ───────────────────────────────────────────────────────

test("not found in a truncated answer is NULL, not false", () => {
  // The load-bearing case. At the old 4,000 cap this hit 64% of ChatGPT answers
  // and 0% of Perplexity's, so scoring these as absent would invent a gap
  // between two engines out of a storage limit.
  const cut = "x".repeat(RESPONSE_TEXT_CAP);
  assert.equal(namedInAnswer({ text: cut, businessName: NAME }), null);
});

test("found in a truncated answer is still true", () => {
  const cut = "Prince Waikiki is great. " + "x".repeat(RESPONSE_TEXT_CAP);
  assert.equal(namedInAnswer({ text: cut, businessName: NAME }), true);
});

test("an empty or missing answer is NULL, not false", () => {
  assert.equal(namedInAnswer({ text: "", businessName: NAME }), null);
  assert.equal(namedInAnswer({ text: null, businessName: NAME }), null);
  assert.equal(namedInAnswer({ text: "   ", businessName: NAME }), null);
});

test("history stored under the old cap is judged against the old cap", () => {
  // Rows written before 2026-09-16 were cut at 4,000. Judging them against
  // 12,000 would read every one of them as a complete answer and turn a
  // truncation into a measured absence.
  const old = "y".repeat(4000);
  assert.equal(namedInAnswer({ text: old, businessName: NAME, cap: 4000 }), null);
  assert.equal(namedInAnswer({ text: old, businessName: NAME }), false); // wrong cap, wrong answer
});

test("looksTruncated only fires near the cap", () => {
  assert.equal(looksTruncated("short"), false);
  assert.equal(looksTruncated("z".repeat(RESPONSE_TEXT_CAP)), true);
});

// ── Aliases ───────────────────────────────────────────────────────────────

test("an alias counts", () => {
  assert.equal(
    namedInAnswer({ text: "The Hawaii Prince Hotel is on Ala Moana.", businessName: NAME, aliases: ["Hawaii Prince Hotel"] }),
    true,
  );
});

// ── Aggregation must not count unknowns as noes ───────────────────────────

test("the two real bounds sit either side of rateJudged", () => {
  const s = presenceStats([true, true, false, null, null]);
  assert.deepEqual({ named: s.named, judged: s.judged, unknown: s.unknown, total: s.total },
    { named: 2, judged: 3, unknown: 2, total: 5 });
  assert.equal(s.rateFloor, 2 / 5);      // no unread answer names them
  assert.equal(s.rateCeiling, 4 / 5);    // every unread answer names them
  assert.equal(s.rateJudged, 2 / 3);     // neither: assumes unread behave like read
  assert.ok((s.rateFloor as number) < (s.rateJudged as number), "floor is below");
  assert.ok((s.rateJudged as number) < (s.rateCeiling as number), "ceiling is above");
});

test("rateJudged is NOT the ceiling", () => {
  // Corrected 2026-09-16. rateJudged was described as the upper bound and used
  // as one. Unread rows are selected for not containing the name early, so
  // dropping them assumes something nothing supports. On Prince's September
  // this understated the real ceiling by eight points, in the direction that
  // flatters the client.
  const s = presenceStats([...Array(124).fill(true), ...Array(52).fill(false), ...Array(105).fill(null)]);
  assert.equal(Math.round((s.rateJudged as number) * 100), 70);
  assert.equal(Math.round((s.rateCeiling as number) * 100), 81);
  assert.ok((s.rateCeiling as number) > (s.rateJudged as number),
    "the ceiling must exceed rateJudged whenever anything is unread");
});

test("all-unknown yields a zero floor and a ceiling of one", () => {
  // Nothing readable: they might never be named, or always be. Both bounds say
  // exactly that, and neither is a finding.
  const s = presenceStats([null, null, null]);
  assert.equal(s.rateJudged, null);
  assert.equal(s.judged, 0);
  assert.equal(s.rateFloor, 0);
  assert.equal(s.rateCeiling, 1);
});

// ── The defect that made this module necessary ────────────────────────────

test("extractEntitiesFromText still does not read its text argument", () => {
  // Pinned so the claim in this module's header cannot quietly go stale. If
  // someone fixes that function, this test fails and the header needs rewriting
  // -- which is the point: the two must not disagree.
  const src = readFileSync("src/citations.ts", "utf8");
  const start = src.indexOf("function extractEntitiesFromText");
  assert.ok(start > 0, "extractEntitiesFromText not found");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.doesNotMatch(body, /\btext\b(?!\s*:)/, "extractEntitiesFromText now reads text; update answer-presence.ts's header");
});

test("capForRun picks the cap in force when the row was written", () => {
  assert.equal(capForRun(RESPONSE_TEXT_CAP_RAISED_AT - 1), 4000);
  assert.equal(capForRun(RESPONSE_TEXT_CAP_RAISED_AT), RESPONSE_TEXT_CAP);
});

// ── The SQL mirror ────────────────────────────────────────────────────────

test("a multi-word name is safe for a boundary-free LIKE", () => {
  assert.equal(nameIsSqlSafe("Prince Waikiki"), true);
  assert.equal(nameIsSqlSafe("Halekulani"), true); // 10 chars, no substring risk
});

test("a short bare token is refused, not counted loosely", () => {
  // The whole reason the TS matcher has a boundary rule. SQL LIKE has none, so
  // a name this short must never reach it.
  assert.equal(nameIsSqlSafe("Kai"), false);
  assert.equal(nameIsSqlSafe("Duke"), false);
  assert.equal(buildPresenceSql({
    clientSlug: "x", businessName: "Kai", windowStart: 0, windowEnd: 1,
  }), null);
});

test("one unsafe alias refuses the whole query", () => {
  // Not "drop the bad one and carry on": a partial count reported as a count
  // is the error this module exists to prevent.
  assert.equal(buildPresenceSql({
    clientSlug: "x", businessName: "Prince Waikiki", aliases: ["Kai"], windowStart: 0, windowEnd: 1,
  }), null);
});

test("LIKE metacharacters in a name are escaped", () => {
  const q = buildPresenceSql({
    clientSlug: "x", businessName: "50% Off Cafe", windowStart: 0, windowEnd: 1,
  });
  assert.ok(q, "multi-word name should build");
  assert.ok(q!.binds.some((b) => typeof b === "string" && b.includes("50\\%")), "the % must be escaped");
  assert.match(q!.sql, /ESCAPE/);
});

test("the query binds both caps so old rows are judged against the old one", () => {
  const q = buildPresenceSql({
    clientSlug: "prince-waikiki", businessName: "Prince Waikiki", windowStart: 100, windowEnd: 200,
  })!;
  assert.ok(q.binds.includes(RESPONSE_TEXT_CAP_RAISED_AT), "cutover instant must be bound");
  assert.ok(q.binds.includes(3990), "legacy cap threshold must be bound");
  assert.ok(q.binds.includes(RESPONSE_TEXT_CAP - 10), "current cap threshold must be bound");
  assert.deepEqual(q.binds.slice(-3), ["prince-waikiki", 100, 200]);
});

test("counts become bounds in exactly one place", () => {
  // openai's real September counts.
  const p = toEnginePresence({ engine: "openai", total: 281, named: 124, unknown_count: 105 });
  assert.equal(p.judged, 176);
  assert.equal(p.rateFloor, 124 / 281);
  assert.equal(p.rateCeiling, 229 / 281);
  assert.equal(p.rateJudged, 124 / 176);
  assert.ok((p.rateFloor as number) < (p.rateCeiling as number));
});

test("an engine whose answers were never truncated has floor == ceiling", () => {
  // perplexity: 0 unread, so there is no uncertainty left to express.
  const p = toEnginePresence({ engine: "perplexity", total: 507, named: 194, unknown_count: 0 });
  assert.equal(p.rateFloor, p.rateCeiling);
  assert.equal(p.rateJudged, p.rateFloor);
});

// ── One document must not carry two verdicts about one surface ────────────
//
// FOUND BY AUDIT 2026-09-16. buildPresence filtered by engine LAYER only, so a
// surface held out of the headline bars for under-collection would still have
// appeared in the presence block one section lower. On prince-waikiki's real
// September facts, ChatGPT search is excluded from the bars and would have
// shown at 44% here.
//
// report-facts already carries a comment about exactly this failure, written
// when the bars and the grid disagreed. It was reproduced one section down by
// a function that did not know the rule existed. A rule written in one place
// and not applied to its neighbour is this codebase's signature defect, and
// this test is the neighbour being told.

test("an engine excluded from the bars cannot appear in the presence block", () => {
  const src = readFileSync("src/lib/report-facts.ts", "utf8");
  const start = src.indexOf("async function buildPresence");
  assert.ok(start > 0, "buildPresence not found");
  const body = src.slice(start, src.indexOf("\nexport async function buildReportFacts", start));
  assert.match(body, /c\.sufficient/, "buildPresence must consult the coverage verdict");
  assert.match(body, /excluded\.has/, "buildPresence must drop excluded engines");
});

test("presence is built after coverage, not before it", () => {
  // Ordering is load-bearing: monthCov must exist before buildPresence is
  // called or the exclusion set is always empty and the check above passes
  // while doing nothing.
  const src = readFileSync("src/lib/report-facts.ts", "utf8");
  const covAt = src.indexOf("let monthCov: EngineCoverage[] | undefined;");
  const callAt = src.indexOf("await buildPresence(env, slug, pStart, pb.end, nameP, monthCov)");
  assert.ok(covAt > 0 && callAt > 0, "both sites must exist");
  assert.ok(covAt < callAt, "monthCov must be computed before buildPresence is called");
});

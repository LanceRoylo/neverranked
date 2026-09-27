/* A count whose denominator moved is not a finding.
 *
 * Intersecting the question set (weekly-brief-like-for-like.test.ts) stopped a
 * SET change from moving the week-over-week delta. It did not stop a VOLUME
 * change, and that is what the two September drafts actually were.
 *
 * Measured from D1 on 2026-09-27, over the questions each pair of weeks shared:
 *
 *   draft 2  wk 09-07  88 shared questions  4,203 runs -> 3,255 runs  (-23%)
 *                      790 citations -> 520            18.8% -> 16.0%
 *   draft 3  wk 09-14  67 shared questions  2,917 runs -> 3,006 runs  (+3%)
 *                      504 citations -> 483            17.3% -> 16.1%
 *
 * Draft 2 was titled "Citations fell 30% while positive sentiment held at 81%".
 * Most of that 30% is a 23% gap in how many queries WE ran. The real movement
 * over the identical question set was 18.8% to 16.0%.
 *
 * Draft 3 was titled "Citation Rate Drops 16% While Gemini and Gemma Lead at
 * 22%". The rate IS 16.1%. It did not drop by 16; it dropped 1.2 points from
 * 17.3%. The 22% is correct (gemini 22.5%, gemma 21.6%).
 *
 * These briefs PUBLISH at /weekly/<slug>. Both errors report our own instrument
 * as the market, from a practice that sells measurement integrity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weekOverWeekBlock } from "../src/weekly-brief-generator";
import type { WeeklyStats } from "../src/weekly-brief-generator";

const SRC = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");

const stats = (o: Partial<WeeklyStats>): WeeklyStats => ({
  weekStartsAt: 0, weekEndsAt: 0, totalCitationRuns: 0, perEngine: [],
  totalBotHits: 0, topBots: [], totalReddit: 0, topSubreddits: [],
  sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
  totalReferrerVisits: 0, topReferrerEngines: [], trackedClients: 0,
  trackedKeywords: 0, newCitationsThisWeek: 0, prevWeekCitations: 0,
  sharedKeywords: 0, sharedRunsCur: 0, sharedRunsPrev: 0, perEngineWow: [],
  ...o,
} as WeeklyStats);

/** Draft 2's real window: same 88 questions, 23% fewer runs. */
const DRAFT_2 = stats({
  sharedKeywords: 88,
  prevWeekCitations: 790, sharedRunsPrev: 4203,
  newCitationsThisWeek: 520, sharedRunsCur: 3255,
});

/** Draft 3's real window: same 67 questions, volume steady. */
const DRAFT_3 = stats({
  sharedKeywords: 67,
  prevWeekCitations: 504, sharedRunsPrev: 2917,
  newCitationsThisWeek: 483, sharedRunsCur: 3006,
});

test("a 23% volume gap is flagged and the count delta is forbidden", () => {
  const b = weekOverWeekBlock(DRAFT_2);
  assert.match(b, /VOLUME WARNING/);
  assert.match(b, /23% FEWER queries/);
  // The generator must be told it may not call 790 -> 520 a citation decline.
  assert.match(b, /may NOT/);
  assert.match(b, /790 and 520/);
});

test("the rate, not the count, is the stated movement", () => {
  const b = weekOverWeekBlock(DRAFT_2);
  // 790/4203 = 18.8%, 520/3255 = 16.0%, so down 2.8 points -- not 30%.
  assert.match(b, /18\.8%/);
  assert.match(b, /16\.0%/);
  assert.match(b, /CITATION RATE: down 2\.8 percentage points/);
  assert.doesNotMatch(b, /30%/, "the raw-count drop must not appear as the finding");
});

test("steady volume raises no warning but still leads with the rate", () => {
  const b = weekOverWeekBlock(DRAFT_3);
  assert.doesNotMatch(b, /VOLUME WARNING/, "a 3% volume change is not a coverage artifact");
  assert.match(b, /17\.3%/);
  assert.match(b, /16\.1%/);
  assert.match(b, /CITATION RATE: down 1\.2 percentage points/);
});

test("a level is labelled as a level, so it cannot be written as a drop", () => {
  // Draft 3's title turned the 16.1% level into a 16% drop.
  const b = weekOverWeekBlock(DRAFT_3);
  assert.match(b, /is a LEVEL, not a change/);
  assert.match(SRC, /A LEVEL is not a CHANGE/, "the system prompt must carry the rule too");
});

test("both denominators are always named", () => {
  for (const [name, s] of [["draft2", DRAFT_2], ["draft3", DRAFT_3]] as const) {
    const b = weekOverWeekBlock(s);
    assert.match(b, new RegExp(`${s.sharedRunsPrev} runs`), `${name}: prior denominator missing`);
    assert.match(b, new RegExp(`${s.sharedRunsCur} runs`), `${name}: current denominator missing`);
  }
});

test("no shared questions still withholds the comparison entirely", () => {
  const b = weekOverWeekBlock(stats({ sharedKeywords: 0, sharedRunsCur: 100, sharedRunsPrev: 100 }));
  assert.match(b, /NO week-over-week movement/);
});

test("a zero denominator cannot divide", () => {
  const b = weekOverWeekBlock(stats({ sharedKeywords: 12, sharedRunsPrev: 0, sharedRunsCur: 50 }));
  assert.match(b, /No prior-week baseline/);
  assert.doesNotMatch(b, /NaN|Infinity/);
});

test("run volume is scoped to the shared questions, not the whole week", () => {
  // Counting all runs in each window would reintroduce the set-change defect
  // through the denominator instead of the numerator.
  assert.match(
    SRC,
    /COUNT\(\*\) FROM citation_runs\s*\n\s*WHERE run_at >= \?3 AND run_at < \?4 AND keyword_id IN \(SELECT keyword_id FROM both\)\) AS cur_runs/,
  );
});

/* Regeneration must actually regenerate.
 *
 * generateWeeklyBrief returned ok:true for ANY existing row for that week,
 * whatever its status. So "regenerate the two bad drafts" would have handed
 * back the two bad drafts and reported success -- a synthetic success, which is
 * not a delivery. A published brief still may not be silently replaced.
 */
test("an unpublished brief is superseded, a published one is never touched", () => {
  const guard = SRC.slice(SRC.indexOf("// Already generated for this week?"));

  assert.match(
    guard,
    /if \(existing\?\.status === "published"\)/,
    "a published brief must be detected specifically, not by mere existence",
  );
  assert.match(guard, /refusing to replace it/);
  assert.match(
    guard,
    /slug = slug \|\| '-superseded-' \|\| id, status = 'rejected'/,
    "an unpublished brief must be moved aside so the new INSERT can take the slug",
  );
  assert.match(guard, /WHERE id = \? AND status <> 'published'/, "the UPDATE must re-check status");
  // A zero-change UPDATE must abort rather than fall through to a slug collision.
  assert.match(guard, /changes \?\? 0\) === 0/);
  assert.match(guard, /nothing regenerated/);

  // The old blanket early-return must be gone.
  assert.doesNotMatch(
    guard.slice(0, guard.indexOf("stats.totalCitationRuns < 10")),
    /if \(existing\) return \{ ok: true/,
    "returning ok:true for any existing row is the synthetic success this removes",
  );
});

/* Pooling hides direction AND mix.
 *
 * Draft 3's pooled rate fell 17.3% -> 16.1%. Measured per surface over the same
 * 67 questions on 2026-09-27, the surfaces disagreed:
 *
 *   gemini              28.0 -> 22.5   (-5.5pp)   <- the actual movement
 *   perplexity          22.1 -> 19.6   (-2.5pp)
 *   anthropic           17.8 -> 18.3   (+0.5pp)   <- UP
 *   google_ai_overview  12.4 -> 13.7   (+1.3pp)   <- UP
 *   gemma               21.7 -> 21.6   (flat)
 *   openai              16.5 -> 15.9   (-0.6pp)
 *
 * And the mix moved: openai cites least and had been FAILING (111 failures on
 * 09-03 alone, a total outage 09-12, 219 runs one week against 366 the next).
 * A week where the lowest-citing surface recovers drags the pooled rate down
 * with no surface changing. Neither is AI tools citing differently.
 */
const DRAFT_3_ENGINES = [
  { engine: "anthropic",          prev_runs: 471, prev_cited: 84, cur_runs: 448, cur_cited: 82 },
  { engine: "gemini",             prev_runs: 471, prev_cited: 132, cur_runs: 448, cur_cited: 101 },
  { engine: "google_ai_overview", prev_runs: 258, prev_cited: 32, cur_runs: 227, cur_cited: 31 },
  { engine: "openai",             prev_runs: 322, prev_cited: 53, cur_runs: 472, cur_cited: 75 },
];

test("each surface reports its own rate against its own prior rate", () => {
  const b = weekOverWeekBlock(stats({
    sharedKeywords: 67,
    prevWeekCitations: 504, sharedRunsPrev: 2917,
    newCitationsThisWeek: 483, sharedRunsCur: 3006,
    perEngineWow: DRAFT_3_ENGINES,
  }));
  assert.match(b, /Per surface, over those same questions/);
  // gemini 132/471 = 28.0% -> 101/448 = 22.5%
  assert.match(b, /gemini\s+28\.0% -> 22\.5%\s+\(-5\.5pp, 471 -> 448 runs\)/);
  // anthropic rose, and must be shown rising rather than absorbed into a fall
  assert.match(b, /anthropic\s+17\.8% -> 18\.3%\s+\(\+0\.5pp/);
  assert.match(b, /Surfaces that moved at least 2 points: gemini down 5\.5pp/);
  assert.match(b, /Report movement PER SURFACE/);
  // Each surface's own denominators travel with it.
  assert.match(b, /322 -> 472 runs/, "openai's run swing must be visible");
});

test("a surface missing from one week cannot be given a movement", () => {
  const b = weekOverWeekBlock(stats({
    sharedKeywords: 10, prevWeekCitations: 5, sharedRunsPrev: 100,
    newCitationsThisWeek: 6, sharedRunsCur: 100,
    perEngineWow: [{ engine: "gemma", prev_runs: 0, prev_cited: 0, cur_runs: 50, cur_cited: 9 }],
  }));
  assert.match(b, /gemma\s+not measured in both weeks; no movement may be stated/);
  assert.doesNotMatch(b, /gemma\s+0\.0% ->/, "a zero-run week is not a 0% rate");
});

test("when nothing moves, that is the finding", () => {
  const b = weekOverWeekBlock(stats({
    sharedKeywords: 20, prevWeekCitations: 100, sharedRunsPrev: 500,
    newCitationsThisWeek: 102, sharedRunsCur: 500,
    perEngineWow: [
      { engine: "gemini", prev_runs: 250, prev_cited: 50, cur_runs: 250, cur_cited: 51 },
      { engine: "openai", prev_runs: 250, prev_cited: 50, cur_runs: 250, cur_cited: 51 },
    ],
  }));
  assert.match(b, /No surface moved as much as 2 points/);
  assert.doesNotMatch(b, /Surfaces that moved at least 2 points/);
});

test("the per-surface rule is in the system prompt too", () => {
  assert.match(SRC, /Week-over-week movement is stated PER SURFACE/);
  assert.match(SRC, /the week's finding is that nothing moved/);
});

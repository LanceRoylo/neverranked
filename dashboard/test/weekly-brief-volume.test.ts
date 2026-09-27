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
  sharedKeywords: 0, sharedRunsCur: 0, sharedRunsPrev: 0,
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

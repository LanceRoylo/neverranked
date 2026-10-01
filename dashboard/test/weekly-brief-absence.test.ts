/* The week-of-2026-09-21 draft, regenerated on 10-01 with the new comparison
 * wiring, got the comparison right and four other things wrong:
 *
 *   "No bot crawler activity was recorded."   Bot logging was dark 09-10 to
 *                                             09-30. 127 rows on 10-01.
 *   "Zero human visits arrived from AI engines."  referrer_hits has never
 *                                             held a row.
 *   "Five others appeared once" + four names. Handed 8 rows and no total.
 *   Headline blamed a client pause whose questions were not in the compared
 *   set, because the refusal reason quoted only the first of four events.
 *
 * The fixtures below are that week's real numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { botBlock, referralBlock, redditBlock, type WeeklyStats } from "../src/weekly-brief-generator";
import { computeComparison, type InstrumentEvent } from "../src/lib/compare-periods";

const WEEK = {
  totalBotHits: 0,
  topBots: [],
  totalReferrerVisits: 0,
  topReferrerEngines: [],
  totalReddit: 16,
  distinctSubreddits: 12,
  topSubreddits: [
    { subreddit: "digitalmarketing", hits: 2 },
    { subreddit: "digital_marketing", hits: 2 },
    { subreddit: "b2bmarketing", hits: 2 },
    { subreddit: "aeo", hits: 2 },
    { subreddit: "techseo", hits: 1 },
    { subreddit: "seogrowth", hits: 1 },
    { subreddit: "seo", hits: 1 },
    { subreddit: "openai", hits: 1 },
  ],
} as unknown as WeeklyStats;

test("a bot pipe with no rows is NOT MEASURED, never zero", () => {
  const b = botBlock(WEEK);
  assert.match(b, /NOT MEASURED/);
  assert.doesNotMatch(b, /Total bot fetches: 0/);
  assert.match(b, /missing\s+data, not zero activity/);
});

test("a referral pipe with no rows is NOT MEASURED, never zero visits", () => {
  const r = referralBlock(WEEK);
  assert.match(r, /NOT MEASURED/);
  assert.doesNotMatch(r, /Total: 0/);
});

test("a live pipe still reports its numbers", () => {
  const live = { ...WEEK, totalBotHits: 127, topBots: [{ bot: "GPTBot", hits: 90 }] } as WeeklyStats;
  assert.match(botBlock(live), /Total bot fetches: 127/);
  assert.match(botBlock(live), /GPTBot: 90 fetches/);
});

test("a cut-off subreddit list says it is cut off, with the true totals", () => {
  const r = redditBlock(WEEK);
  assert.match(r, /across 12 subreddits/);
  assert.match(r, /CUT OFF: it shows 8 of 12 subreddits and 12 of 16 threads/);
  assert.match(r, /Say nothing about the subreddits not listed/);
});

test("a complete subreddit list carries no cut-off warning", () => {
  const whole = { ...WEEK, totalReddit: 12, distinctSubreddits: 8 } as WeeklyStats;
  assert.doesNotMatch(redditBlock(whole), /CUT OFF/);
});

test("a refusal names every event, not the first one found", () => {
  const events: InstrumentEvent[] = [
    { occurred_at: 1, kind: "client_paused", scope: "client", client_slug: "x", detail: "cost decision" },
    { occurred_at: 2, kind: "question_set_changed", scope: "client", client_slug: "y", detail: "a" },
    { occurred_at: 3, kind: "question_set_changed", scope: "client", client_slug: "z", detail: "b" },
    { occurred_at: 4, kind: "question_set_changed", scope: "client", client_slug: "z", detail: "c" },
  ];
  const c = computeComparison({
    sharedKeywords: 67,
    perSurface: [{ engine: "gemini", prevRuns: 448, prevHits: 101, curRuns: 433, curHits: 120 }],
    prevWindow: { start: 0, end: 1 },
    curWindow: { start: 1, end: 2 },
    events,
  });
  const m = c.perSurface[0].movement;
  assert.equal(m.kind, "withheld");
  if (m.kind === "withheld") {
    assert.match(m.reason, /4 recorded changes: client_paused, question_set_changed, question_set_changed, question_set_changed/);
    assert.doesNotMatch(m.reason, /cost decision/, "no single event's detail may stand in for all four");
  }
});

test("the writer is told not to forecast, not to pick a cause, and not to zero a gap", () => {
  const src = fs.readFileSync(new URL("../src/weekly-brief-generator.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Close by naming what next week's numbers would have to show/);
  assert.match(src, /Do not add a section about next week/);
  assert.match(src, /do not single one out as the reason/);
  assert.match(src, /Never turn it into a zero/);
});

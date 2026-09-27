/* The regenerate route could not reach the draft it was needed for.
 *
 * handleAdminBriefRegenerate called generateWeeklyBrief(env) with no week, so
 * it always regenerated mostRecentMonday-7. On 2026-09-27 that is the week of
 * 09-14, which meant the week-of-09-07 draft was unreachable while the button
 * appeared to offer regeneration. Both drafts needed regenerating after the
 * week-over-week basis was fixed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/routes/weekly.ts", import.meta.url), "utf8");
const HANDLER = SRC.slice(SRC.indexOf("export async function handleAdminBriefRegenerate"));

test("the target week is passed through to the generator", () => {
  assert.match(HANDLER, /generateWeeklyBrief\(env, weekStartsAt\)/);
  assert.doesNotMatch(
    HANDLER,
    /generateWeeklyBrief\(env\)\s*;/,
    "the no-argument call is what made one draft unreachable",
  );
});

test("a non-Monday is refused, because the slug is named from this value", () => {
  assert.match(HANDLER, /getUTCDay\(\) !== 1/);
  assert.match(HANDLER, /must be a Monday/);
});

test("an unfinished week is refused rather than aggregated sparse", () => {
  assert.match(HANDLER, /has not finished yet/);
  assert.match(HANDLER, /weekStartsAt \+ 7 \* 86400 > Math\.floor\(Date\.now\(\) \/ 1000\)/);
});

test("a malformed date is refused with the value that was sent", () => {
  assert.match(HANDLER, /week must be YYYY-MM-DD/);
  assert.match(HANDLER, /Number\.isFinite\(t\)/);
});

test("the refusal reaches the caller instead of only a log", () => {
  // A 200 with a silent no-op is how "regenerate" reported success on the
  // drafts it had not touched.
  assert.match(SRC, /function badRequest/);
  assert.match(SRC, /status: 400/);
});

test("omitting the week keeps the existing default behaviour", () => {
  // weekStartsAt stays undefined, and generateWeeklyBrief's own default applies.
  assert.match(HANDLER, /let weekStartsAt: number \| undefined;/);
  assert.match(HANDLER, /const weekRaw = form\.get\("week"\);/);
  assert.match(HANDLER, /if \(weekRaw\) \{/);
});

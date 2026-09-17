import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Four fixes on 2026-09-16, all the same shape: something reported work it was
 * not doing, or measured against a yardstick that did not fit. None was a
 * stopped pipeline. */

test("the delivery facts backfill runs BEFORE delivered_at is stamped", () => {
  // It used to run after, and emitReportFacts refuses outright when
  // delivered_at is set, so the call was dead from the day that guard landed
  // while its comment claimed it was "the catch-all that makes charts
  // automatic for EVERY report".
  const src = readFileSync("src/routes/admin-memos.ts", "utf8");
  const emitAt = src.indexOf("emitReportFacts");
  const stampAt = src.indexOf("delivered_at=unixepoch()");
  assert.ok(emitAt > 0 && stampAt > 0, "both sites must exist");
  assert.ok(emitAt < stampAt, "the backfill must run before delivery is stamped or it can never fire");
});

test("the backfill only fires when there are no frozen facts", () => {
  // Immutability: the body was vetted against the existing facts a few lines
  // up. Regenerating them after that vet leaves prose and charts describing
  // different numbers.
  const src = readFileSync("src/routes/admin-memos.ts", "utf8");
  assert.match(src, /meta\.facts_json == null/, "backfill must be conditional on absent facts");
});

test("AI Overviews is not judged against a peer median", () => {
  // It legitimately declines to render on roughly half the roster, so the peer
  // median is the wrong yardstick and it alerted every day from 09-12.
  const src = readFileSync("src/lib/engine-peer-health.ts", "utf8");
  assert.match(src, /SELF_BASELINE_ENGINES/);
  assert.match(src, /google_ai_overview/);
  assert.match(src, /peers = counts\.filter\(\(c\) => !SELF_BASELINE_ENGINES\.has/, "the median must be built from comparable surfaces only");
  assert.match(src, /degraded: !SELF_BASELINE_ENGINES\.has/, "a self-baseline engine must never be marked degraded");
  // Still reported, just never judged: hiding it would trade one blind spot
  // for another, and the digest should show its row count.
  assert.doesNotMatch(src, /counts = rows[\s\S]{0,200}?filter\(\(r\) => !SELF_BASELINE_ENGINES/,
    "self-baseline engines must stay in the returned list");
});

test("the row-drop baseline counts only currently-active keywords", () => {
  // Yesterday's count can only contain active keywords, because
  // planCitationRun filters on active = 1. A baseline that counts everything
  // describes a bigger roster than the numerator can ever reach, so removing a
  // client manufactures a drop.
  const src = readFileSync("src/lib/anomaly-detection.ts", "utf8");
  const head = src.slice(src.indexOf("const prevDayRows"), src.indexOf("const recentRows"));
  const joins = head.match(/JOIN citation_keywords ck ON ck\.id = cr\.keyword_id/g) ?? [];
  assert.equal(joins.length, 2, "both yesterday and the prior-days baseline must be scoped");
  assert.equal((head.match(/ck\.active = 1/g) ?? []).length, 2, "both must filter on active = 1");
});

test("the HTC event cron will not write while nothing serves the rows", () => {
  // injection_configs.enabled = 0 since 2026-07-24. The cron kept writing ~35
  // rows a day and filing an alert saying "Event schema deployed".
  const src = readFileSync("src/htc-events-cron.ts", "utf8");
  assert.match(src, /async function injectionIsServed/);
  assert.match(src, /!dryRun && !\(await injectionIsServed\(env\)\)/, "the write path must be gated");
  // Fail closed: an unreadable config must not be read as permission to write.
  const fn = src.slice(src.indexOf("async function injectionIsServed"), src.indexOf("export async function refreshHawaiiTheatreEvents"));
  assert.match(fn, /catch\s*\{[\s\S]*return false/, "an error must deny, not allow");
});

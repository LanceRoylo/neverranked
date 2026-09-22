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

test("the snippet sweep only chases domains where injection is live", () => {
  // Hosted schema injection was retired 2026-07-24 and every
  // injection_configs row is enabled = 0, yet the sweep kept escalating:
  // "Snippet still not installed on montaic.com after 154 days", plus the
  // same for neverranked.com. Two of the four alerts the 2026-09-18 briefing
  // said needed a human were nudges to install something that would do
  // nothing if installed.
  const src = readFileSync("src/cron.ts", "utf8");
  const i = src.indexOf("SELECT d.* FROM domains d");
  assert.ok(i > 0, "the snippet sweep query should select from domains");
  const q = src.slice(i, i + 400);
  assert.match(q, /JOIN injection_configs ic ON ic\.client_slug = d\.client_slug AND ic\.enabled = 1/,
    "a retired capability must not generate work");
});

test("prompt auto-expand never refills a client that has been switched off", () => {
  // Removing and-scene on 2026-09-14 dropped its active keyword count to zero,
  // which is below MIN_TARGET, so the Monday sweep read a deliberate removal as
  // a shortage and inserted twelve new active keywords. Twice.
  const src = readFileSync("src/prompt-auto-expand.ts", "utf8");
  const i = src.indexOf("export async function runAutoExpandSweep");
  const body = src.slice(i, i + 2400);
  assert.match(body, /JOIN measurement_registry mr ON mr\.client_slug = ic\.client_slug AND mr\.active = 1/,
    "only a client actually being measured may be expanded");
});

test("the question set locks when measurement starts", () => {
  // hawaii-theatre's measurement began 2026-08-01, then auto-expand added
  // questions on successive Mondays, so the measured set changed almost every
  // week. That drift is what produced +11 in HTC's September memo while the
  // locked 18 were down 4.
  const src = readFileSync("src/prompt-auto-expand.ts", "utf8");
  const fn = src.slice(src.indexOf("export async function autoExpandPromptsForClient"));
  const lockAt = fn.indexOf("measurement_start");
  const workAt = fn.indexOf("discoverContext(");
  assert.ok(lockAt > 0, "the per-client function must consult measurement_start");
  assert.ok(lockAt < workAt, "the lock must be checked before any generation work, including model calls");
  assert.match(fn.slice(0, workAt), /start <= Math\.floor\(Date\.now\(\) \/ 1000\)/, "a started client must add nothing");
});

test("the lock lives in the function every caller uses", () => {
  // The admin run-monday route calls autoExpandPromptsForClient directly. A
  // gate placed only on the Monday sweep would be bypassed by it.
  const route = readFileSync("src/routes/admin-run-monday.ts", "utf8");
  assert.match(route, /autoExpandPromptsForClient/, "the direct caller still exists, so the lock must be in the function");
});

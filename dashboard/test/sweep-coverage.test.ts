import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeCoverage,
  describeCoverage,
  coverageFingerprint,
  type KeywordCoverage,
} from "../src/lib/sweep-coverage";

/* The fixture below is the REAL shape of the 2026-09-10 to 2026-09-14 outage,
 * taken from production. Slugs are anonymized: this repo is public and
 * per-client figures belong in the private docs repo.
 *
 *     client     active kw   rows written per night
 *     alpha             22   wrote normally
 *     bravo             30   wrote normally
 *     charlie           15   wrote normally
 *     delta             11   ZERO, on every engine, for five nights
 *
 * 78 dispatched, 67 written, every night, no alert. Three engine-shaped checks
 * were running and all three stayed silent, because all seven engines lost the
 * same eleven keywords and therefore agreed with each other perfectly. */

function kw(clientSlug: string, n: number, rowsWritten: number, idBase = 0): KeywordCoverage[] {
  return Array.from({ length: n }, (_, i) => ({
    clientSlug,
    keywordId: idBase + i,
    keyword: `q${i}`,
    rowsWritten,
  }));
}

/** 7 engines x 1 run each is the healthy per-keyword shape. */
const HEALTHY = 7;

const OUTAGE: KeywordCoverage[] = [
  ...kw("alpha", 22, HEALTHY, 100),
  ...kw("bravo", 30, HEALTHY, 200),
  ...kw("charlie", 15, HEALTHY, 300),
  ...kw("delta", 11, 0, 400),
];

test("the real outage: 11 of 78 dark, all belonging to one client", () => {
  const s = summarizeCoverage(OUTAGE);
  assert.equal(s.activeKeywords, 78);
  assert.equal(s.darkKeywords, 11);
  assert.deepEqual(s.affected, [{ clientSlug: "delta", active: 11, dark: 11 }]);
});

test("a client dark on every keyword is called out separately", () => {
  // This is the distinction that matters operationally. One dark keyword is a
  // glitch; a client whose entire set is dark is not being measured at all,
  // and nobody is going to notice from the numbers because there are none.
  assert.deepEqual(summarizeCoverage(OUTAGE).fullyDark, ["delta"]);
});

test("a healthy night raises nothing", () => {
  const s = summarizeCoverage(kw("alpha", 67, HEALTHY));
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
  assert.deepEqual(s.fullyDark, []);
});

test("partial engine coverage is NOT dark", () => {
  // Google AI Overviews legitimately declines to answer roughly 55% of
  // questions, so a keyword that wrote 3 rows instead of 7 is an ordinary
  // night. If this ever returns dark, the check fires every single night and
  // becomes noise, which is the failure mode it exists to avoid.
  const s = summarizeCoverage(kw("alpha", 30, 3));
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
});

test("one dark keyword in a healthy client is still reported", () => {
  const s = summarizeCoverage([...kw("alpha", 21, HEALTHY, 100), ...kw("alpha", 1, 0, 900)]);
  assert.equal(s.darkKeywords, 1);
  assert.deepEqual(s.affected, [{ clientSlug: "alpha", active: 22, dark: 1 }]);
  // Not fully dark: 1 of 22 is a glitch, not an unmeasured client.
  assert.deepEqual(s.fullyDark, []);
});

test("affected clients sort worst-first so the title names the worst one", () => {
  const s = summarizeCoverage([
    ...kw("alpha", 22, 0, 100),
    ...kw("bravo", 30, HEALTHY, 200),
    ...kw("charlie", 15, 0, 300),
  ]);
  assert.deepEqual(s.affected.map((c) => c.clientSlug), ["alpha", "charlie"]);
});

test("the alert body names the client and the count, not just a degradation", () => {
  const body = describeCoverage(summarizeCoverage(OUTAGE));
  assert.match(body, /11 of 78 active keywords wrote no row/);
  assert.match(body, /delta: 11\/11 dark/);
  assert.match(body, /EVERY keyword for this client is dark/);
  // It must point at dispatch, not at the engines. Every engine looked fine
  // during the real outage, and a reader sent to check API keys would have
  // found nothing wrong and concluded the alert was spurious.
  assert.match(body, /workflows are being created/);
});

test("fingerprint distinguishes two different outages", () => {
  const a = coverageFingerprint(summarizeCoverage(OUTAGE));
  const b = coverageFingerprint(
    summarizeCoverage([...kw("alpha", 22, 0, 100), ...kw("delta", 11, HEALTHY, 400)]),
  );
  assert.notEqual(a, b);
  // And is stable for the same outage, so a persisting problem dedupes
  // within the day rather than alerting on every evaluation pass.
  assert.equal(a, coverageFingerprint(summarizeCoverage(OUTAGE)));
});

test("an empty roster is not an outage", () => {
  // Everything deactivated on purpose (a client removed for cost) must not
  // read as 0 of 0 dark and alert forever.
  const s = summarizeCoverage([]);
  assert.equal(s.activeKeywords, 0);
  assert.equal(s.darkKeywords, 0);
  assert.deepEqual(s.affected, []);
});

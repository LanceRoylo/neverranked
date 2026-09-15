import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickSample,
  agreementStats,
  instrumentSdPp,
  REPLICATES,
  type SampleCandidate,
  type ReplicateGroup,
} from "../src/lib/replicate-sample";

/* Ask the same question three times in the same minute.
 *
 * RUNS_PER_KEYWORD = 1, so the measurement has never taken a replicate and
 * nothing has separated the engine answering differently from the world
 * changing. Three readings taken back to back should agree. Every disagreement
 * is the instrument, because nothing in the world changed in ninety seconds. */

const cands = (slug: string, ids: number[]): SampleCandidate[] =>
  ids.map((keywordId) => ({ keywordId, clientSlug: slug }));

const ROSTER = [...cands("alpha", [1, 2, 3, 4, 5, 6]), ...cands("bravo", [10, 11, 12])];

// ── Sampling ──────────────────────────────────────────────────────────────

test("the same week picks the same questions", () => {
  // Reproducibility is the point. A sample you cannot re-derive is the thing
  // this company sells against.
  assert.deepEqual(pickSample(ROSTER, 7), pickSample(ROSTER, 7));
});

test("consecutive weeks pick different questions", () => {
  const a = pickSample(ROSTER, 0).map((c) => c.keywordId);
  const b = pickSample(ROSTER, 1).map((c) => c.keywordId);
  assert.notDeepEqual(a, b);
});

test("rotation eventually covers every question", () => {
  const seen = new Set<number>();
  for (let w = 0; w < 12; w++) for (const c of pickSample(ROSTER, w)) seen.add(c.keywordId);
  assert.equal(seen.size, ROSTER.length, `only covered ${[...seen].sort((x, y) => x - y)}`);
});

test("every client is sampled, not just the biggest", () => {
  const s = pickSample(ROSTER, 3);
  assert.ok(s.some((c) => c.clientSlug === "alpha"));
  assert.ok(s.some((c) => c.clientSlug === "bravo"));
});

test("a client with fewer questions than the quota is not over-drawn", () => {
  const s = pickSample(cands("tiny", [1, 2]), 5, 3);
  assert.equal(s.length, 2);
  assert.equal(new Set(s.map((c) => c.keywordId)).size, 2, "must not repeat a question within a week");
});

test("an empty roster samples nothing rather than throwing", () => {
  assert.deepEqual(pickSample([], 4), []);
});

// ── Agreement ─────────────────────────────────────────────────────────────

const group = (engine: string, cited: boolean[]): ReplicateGroup => ({ keywordId: 1, engine, cited });

test("unanimous readings are not a disagreement", () => {
  const s = agreementStats([group("openai", [true, true, true]), group("gemini", [false, false, false])]);
  assert.equal(s.groups, 2);
  assert.equal(s.split, 0);
  assert.equal(s.disagreementRate, 0);
});

test("a split group is counted, whichever way it splits", () => {
  const s = agreementStats([
    group("openai", [true, false, true]),
    group("gemini", [false, false, true]),
    group("perplexity", [true, true, true]),
  ]);
  assert.equal(s.split, 2);
  assert.equal(s.disagreementRate, 0.6667);
});

test("incomplete groups are DROPPED, never counted as agreeing", () => {
  // A group that lost a reading to an API failure cannot show disagreement.
  // Counting it as agreement would understate instrument noise, which is the
  // direction that flatters us.
  const s = agreementStats([
    group("openai", [true, true]),           // lost one, excluded
    group("gemini", [true, false, true]),    // complete, split
  ]);
  assert.equal(s.groups, 1);
  assert.equal(s.split, 1);
  assert.equal(s.disagreementRate, 1);
});

test("per-engine rates are reported worst first", () => {
  const s = agreementStats([
    group("steady", [true, true, true]),
    group("steady", [true, true, true]),
    group("flaky", [true, false, true]),
    group("flaky", [false, true, false]),
  ]);
  assert.equal(s.byEngine[0].engine, "flaky");
  assert.equal(s.byEngine[0].rate, 1);
  assert.equal(s.byEngine[1].rate, 0);
});

// ── Turning it into a band ────────────────────────────────────────────────

test("a perfectly stable instrument contributes zero points", () => {
  const s = agreementStats(Array.from({ length: 30 }, () => group("openai", [true, true, true])));
  assert.equal(instrumentSdPp(s, 30), 0);
});

test("a noisy instrument contributes real points", () => {
  const groups = Array.from({ length: 30 }, (_, i) =>
    group("openai", i % 2 === 0 ? [true, false, true] : [true, true, true]),
  );
  const sd = instrumentSdPp(agreementStats(groups), 30);
  assert.ok(sd !== null && sd > 5, `sd ${sd} should be material at a 50% disagreement rate`);
});

test("too few groups yields null, not a confident zero", () => {
  const s = agreementStats([group("openai", [true, true, true])]);
  assert.equal(instrumentSdPp(s, 30), null);
});

test("REPLICATES is three, and the stats agree with it", () => {
  assert.equal(REPLICATES, 3);
  const s = agreementStats([group("openai", [true, true, true])], REPLICATES);
  assert.equal(s.groups, 1);
});

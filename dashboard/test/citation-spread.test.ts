import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The roster's OpenAI calls must arrive PACED, not in a burst.
 *
 * gpt-5-search-api is capped at 80,000 tokens per MINUTE. On 2026-09-07 every
 * OpenAI call across three days landed between 06:00 and 06:04 UTC: 65
 * succeeded and 199 were rejected 429 with "Used 80000". The daily volume was
 * never the problem, the shape of its arrival was.
 *
 * This pins the offset function's DISTRIBUTION, because a spread that clusters
 * is the same outage with extra steps. Mirrors the calculation in
 * workflows/citation-keyword.ts -- if that changes, this must be updated
 * deliberately rather than by accident.
 */

const SPREAD_SECONDS = 900;
const offsetFor = (keywordId: number) => (keywordId * 97) % SPREAD_SECONDS;

/** Real active keyword ids are handed out sequentially per client, which is
 *  exactly the pattern a naive modulo fails on. */
const sequentialRoster = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => start + i);

function busiestMinute(ids: number[]): number {
  const bins = new Map<number, number>();
  for (const id of ids) {
    const m = Math.floor(offsetFor(id) / 60);
    bins.set(m, (bins.get(m) ?? 0) + 1);
  }
  return Math.max(...bins.values());
}

test("a sequential client block does NOT land in one bucket", () => {
  // `id % SPREAD_SECONDS` would drop 30 consecutive ids into a 30-second band
  // and rebuild the burst. The prime multiplier is what prevents that.
  const oneClient = sequentialRoster(200, 30);
  const naive = new Set(oneClient.map((id) => Math.floor((id % SPREAD_SECONDS) / 60)));
  const primed = new Set(oneClient.map((id) => Math.floor(offsetFor(id) / 60)));
  assert.equal(naive.size, 1, "precondition: naive modulo clusters a client into one minute");
  assert.ok(primed.size >= 10, `prime spread only reached ${primed.size} distinct minutes`);
});

test("the full roster stays under the TPM ceiling at realistic call cost", () => {
  // 93 active keywords across four clients, ids roughly as they exist today.
  const roster = [
    ...sequentialRoster(200, 30),
    ...sequentialRoster(120, 26),
    ...sequentialRoster(60, 22),
    ...sequentialRoster(10, 15),
  ];
  assert.equal(roster.length, 93);
  const worst = busiestMinute(roster);
  // A search-grade call bills the retrieved page content too, so the per-call
  // cost is far above max_tokens. 8,000 is the working estimate.
  const tokensPerMinute = worst * 8000;
  assert.ok(
    tokensPerMinute < 80000,
    `busiest minute ${worst} calls = ${tokensPerMinute} tokens/min, over the 80,000 ceiling`,
  );
});

test("offsets are deterministic, because workflow steps replay", () => {
  // A Math.random() delay computed outside a step would differ on replay and
  // the sleep would not be honoured consistently.
  for (const id of [1, 57, 230, 999]) {
    assert.equal(offsetFor(id), offsetFor(id));
    assert.ok(offsetFor(id) >= 0 && offsetFor(id) < SPREAD_SECONDS);
  }
});

test("no keyword waits longer than the spread window", () => {
  const roster = sequentialRoster(1, 500);
  for (const id of roster) {
    assert.ok(offsetFor(id) < SPREAD_SECONDS, `id ${id} would wait past the window`);
  }
});

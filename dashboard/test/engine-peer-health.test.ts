import { test } from "node:test";
import assert from "node:assert";
import { assessPeerHealth, summarizePeerHealth } from "../src/lib/engine-peer-health.ts";

function envWith(counts: Record<string, number>) {
  return {
    DB: {
      prepare() {
        return { bind() { return {
          async all() {
            return { results: Object.entries(counts).map(([engine, n]) => ({ engine, n })) };
          },
        }; } };
      },
    },
  } as any;
}

test("peer health: flags the surface that fell behind its siblings", async () => {
  // The real 2026-08-30 fleet. The self-baseline check called this "degraded=0".
  const h = await assessPeerHealth(envWith({
    anthropic: 61, bing: 61, gemini: 61, gemma: 61,
    perplexity: 60, google_ai_overview: 46, openai: 17,
  }), 0);
  const bad = h.filter((x) => x.degraded).map((x) => x.engine);
  assert.deepEqual(bad, ["openai"], "openai at 28% of median must be flagged");
  assert.equal(h[0].median, 61, "median is the healthy peers, not the average");
  assert.equal(h[0].engine, "openai", "worst offender sorts first");
  // AI Overviews legitimately declines to answer; 75% must NOT alarm.
  assert.equal(h.find((x) => x.engine === "google_ai_overview")!.degraded, false);
});

test("peer health: median survives TWO collapsed engines", async () => {
  // Why median, not mean: a mean would be dragged down by the failures and
  // could hide them. Four healthy of six keeps the yardstick honest.
  const h = await assessPeerHealth(envWith({
    a: 60, b: 60, c: 60, d: 60, e: 2, f: 3,
  }), 0);
  assert.equal(h[0].median, 60);
  assert.deepEqual(h.filter((x) => x.degraded).map((x) => x.engine).sort(), ["e", "f"]);
});

test("peer health: a quiet fleet yields NO OPINION, not a clean bill", async () => {
  // Every engine idle (deploy window, cron miss). Ratios are meaningless and
  // must not be reported as healthy -- that is the failure this replaces.
  const h = await assessPeerHealth(envWith({ a: 3, b: 2, c: 4 }), 0);
  assert.deepEqual(h, []);
  assert.equal(summarizePeerHealth(h), "not assessed (fleet quiet)");
});

test("peer health: too few surfaces reporting is also no opinion", async () => {
  assert.deepEqual(await assessPeerHealth(envWith({ a: 60, b: 60 }), 0), []);
});

test("peer health: summary names the offenders for the digest", async () => {
  const h = await assessPeerHealth(envWith({
    anthropic: 61, bing: 61, gemini: 61, gemma: 61,
    perplexity: 60, google_ai_overview: 46, openai: 17,
  }), 0);
  assert.equal(summarizePeerHealth(h), "1 of 7 — openai 28%");
});

test("peer health: healthy fleet reports zero", async () => {
  const h = await assessPeerHealth(envWith({ a: 60, b: 61, c: 59, d: 60 }), 0);
  assert.equal(summarizePeerHealth(h), "0 of 4");
});

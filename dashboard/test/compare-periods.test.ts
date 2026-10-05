/* The comparison primitive, pinned to cases whose right answers are known.
 *
 * Every fixture here is real measurement pulled from D1 on 2026-09-27, and
 * every expected result is one that was worked out by hand that day, usually
 * after getting it wrong first. Synthetic cases are labelled as such.
 *
 * Nothing imports compare-periods.ts yet. It is built ahead of the 2026-10-15
 * boundary so landing it is a wiring job, and these tests are what make that
 * wiring safe to do against the monthly memo, which is a paid deliverable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeComparison,
  describeMovement,
  type InstrumentEvent,
  type Movement,
  type SurfaceCounts,
} from "../src/lib/compare-periods";

const stated = (m: Movement) => {
  assert.equal(m.kind, "stated", `expected a stated movement, got: ${m.kind === "withheld" ? m.reason : ""}`);
  return m as Extract<Movement, { kind: "stated" }>;
};
const withheld = (m: Movement) => {
  assert.equal(m.kind, "withheld", "expected this movement to be withheld");
  return m as Extract<Movement, { kind: "withheld" }>;
};

/* hawaii-theatre, August vs September 2026, over the 22 questions measured in
 * BOTH months. August measured 34 questions, September 29. */
const HTC: SurfaceCounts[] = [
  { engine: "anthropic",          prevRuns: 694, prevHits: 421, curRuns: 569, curHits: 350 },
  { engine: "bing",               prevRuns: 692, prevHits: 5,   curRuns: 573, curHits: 3 },
  { engine: "gemini",             prevRuns: 694, prevHits: 430, curRuns: 573, curHits: 348 },
  { engine: "gemma",              prevRuns: 664, prevHits: 433, curRuns: 566, curHits: 349 },
  { engine: "google_ai_overview", prevRuns: 361, prevHits: 162, curRuns: 335, curHits: 101 },
  { engine: "openai",             prevRuns: 438, prevHits: 149, curRuns: 453, curHits: 128 },
  { engine: "perplexity",         prevRuns: 616, prevHits: 353, curRuns: 579, curHits: 231 },
];

/** The confound that is not in the data and had to be supplied. */
const PERPLEXITY_MIGRATION: InstrumentEvent = {
  occurred_at: Date.parse("2026-08-23T00:00:00Z") / 1000,
  kind: "engine_adapter_changed",
  scope: "engine",
  engine: "perplexity",
  detail: "moved to the Agent API; rate ran 58-62% before and 27-48% after",
};

/* The weekly brief's draft 3, week of 2026-09-14 against the prior week, over
 * the 67 questions measured in both. */
const DRAFT_3: SurfaceCounts[] = [
  { engine: "anthropic",          prevRuns: 471, prevHits: 84,  curRuns: 448, curHits: 82 },
  { engine: "bing",               prevRuns: 469, prevHits: 0,   curRuns: 472, curHits: 1 },
  { engine: "gemini",             prevRuns: 471, prevHits: 132, curRuns: 448, curHits: 101 },
  { engine: "gemma",              prevRuns: 456, prevHits: 99,  curRuns: 464, curHits: 100 },
  { engine: "google_ai_overview", prevRuns: 258, prevHits: 32,  curRuns: 227, curHits: 31 },
  { engine: "openai",             prevRuns: 322, prevHits: 53,  curRuns: 472, curHits: 75 },
  { engine: "perplexity",         prevRuns: 470, prevHits: 104, curRuns: 475, curHits: 93 },
];

const WINDOWS = {
  curWindow: { start: 1789344000, end: 1789948800 },
  prevWindow: { start: 1788739200, end: 1789344000 },
};

test("an engine implementation change withholds that surface, and only that one", () => {
  const r = computeComparison({ sharedKeywords: 22, perSurface: HTC, events: [PERPLEXITY_MIGRATION], ...WINDOWS });

  const px = r.perSurface.find((s) => s.engine === "perplexity")!;
  assert.match(withheld(px.movement).reason, /engine_adapter_changed/);
  assert.match(withheld(px.movement).reason, /Agent API/);

  // The 17-point fall that nearly went to a client is never computed.
  assert.doesNotMatch(withheld(px.movement).reason, /17/);

  // An engine-scoped event does not silence unrelated surfaces.
  const aio = stated(r.perSurface.find((s) => s.engine === "google_ai_overview")!.movement);
  assert.equal(aio.prevRate.toFixed(1), "44.9");
  assert.equal(aio.curRate.toFixed(1), "30.1");
  assert.equal(aio.deltaPp.toFixed(1), "-14.7");
});

test("a poisoned surface poisons its whole layer's pooled figure", () => {
  const r = computeComparison({ sharedKeywords: 22, perSurface: HTC, events: [PERPLEXITY_MIGRATION], ...WINDOWS });
  // perplexity is citation-grade, so the citation pool cannot be stated even
  // though gemini, AIO and openai each still can.
  assert.match(withheld(r.pooled.citation).reason, /perplexity/);
  // This is the single number that would have become "HTC is down 5.6 points".
  assert.equal(r.pooled.citation.kind, "withheld");
});

test("HTC's model-knowledge pool is withheld for volume, which is the honest answer", () => {
  const r = computeComparison({ sharedKeywords: 22, perSurface: HTC, events: [PERPLEXITY_MIGRATION], ...WINDOWS });
  // 1,358 runs against 1,135 is a 16% drop on the same questions.
  const w = withheld(r.pooled.model_knowledge);
  assert.match(w.reason, /16% fewer queries/);
  assert.match(w.reason, /our coverage and not the market/);
});

test("a mix shift inside a layer withholds the pool even when the total looks calm", () => {
  const r = computeComparison({ sharedKeywords: 67, perSurface: DRAFT_3, ...WINDOWS });
  // The citation layer moved 1,521 runs to 1,622, a calm 6.6%. Inside it,
  // openai went 322 to 472 on the lowest-citing surface. The pooled rate fell
  // 17.3% to 16.1% and no surface had changed.
  assert.ok(r.basis.volumeSkew < 0.10, "the aggregate deliberately looks fine");
  const w = withheld(r.pooled.citation);
  assert.match(w.reason, /openai/);
  assert.match(w.reason, /47%/);
  assert.match(w.reason, /part of any pooled move is that mix/);
});

test("a stable layer with agreeing surfaces is stated", () => {
  const r = computeComparison({ sharedKeywords: 67, perSurface: DRAFT_3, ...WINDOWS });
  // anthropic and gemma: 927 runs to 912, both surfaces flat.
  const m = stated(r.pooled.model_knowledge);
  assert.equal(m.prevRate.toFixed(1), "19.7");
  assert.equal(m.curRate.toFixed(1), "20.0");
});

test("the surfaces that moved are named individually, and never the control", () => {
  const r = computeComparison({ sharedKeywords: 67, perSurface: DRAFT_3, ...WINDOWS });
  assert.deepEqual(r.movedSurfaces, ["gemini down 5.5pp", "perplexity down 2.5pp"]);
  assert.ok(!r.movedSurfaces.some((s) => s.includes("bing")));
});

test("the control is excluded however far it swings", () => {
  // Synthetic: a 20-point swing on the control, which may still never read as
  // an AI tool changing behaviour.
  const r = computeComparison({
    sharedKeywords: 10,
    perSurface: [
      { engine: "bing",   prevRuns: 100, prevHits: 5,  curRuns: 100, curHits: 25 },
      { engine: "gemini", prevRuns: 100, prevHits: 20, curRuns: 100, curHits: 21 },
    ],
    ...WINDOWS,
  });
  assert.deepEqual(r.movedSurfaces, []);
  const bing = r.perSurface.find((s) => s.engine === "bing")!;
  assert.equal(bing.layer, "control");
  // Its own numbers still travel, they are just never pooled or promoted.
  assert.equal(stated(bing.movement).deltaPp.toFixed(1), "20.0");
  assert.equal(r.basis.prevRuns, 100, "the control is outside the basis");
});

test("the two layers are never pooled together", () => {
  const r = computeComparison({ sharedKeywords: 67, perSurface: DRAFT_3, ...WINDOWS });
  assert.deepEqual(Object.keys(r.pooled).sort(), ["citation", "model_knowledge"]);
  // Removing every citation surface must not disturb the model-knowledge pool.
  const only2 = computeComparison({
    sharedKeywords: 67,
    perSurface: DRAFT_3.filter((s) => s.engine === "anthropic" || s.engine === "gemma"),
    ...WINDOWS,
  });
  assert.deepEqual(r.pooled.model_knowledge, only2.pooled.model_knowledge);
});

test("a window with no runs is withheld, never rendered as a 0% rate", () => {
  const r = computeComparison({
    sharedKeywords: 5,
    perSurface: [{ engine: "gemma", prevRuns: 0, prevHits: 0, curRuns: 50, curHits: 9 }],
    ...WINDOWS,
  });
  const w = withheld(r.perSurface[0].movement);
  assert.match(w.reason, /not measured in the prior window/);
  assert.doesNotMatch(w.reason, /0%/);
});

test("no shared question withholds everything, including both pools", () => {
  const r = computeComparison({ sharedKeywords: 0, perSurface: DRAFT_3, ...WINDOWS });
  assert.equal(r.pooled.citation.kind, "withheld");
  assert.equal(r.pooled.model_knowledge.kind, "withheld");
  for (const s of r.perSurface) {
    assert.match(withheld(s.movement).reason, /measured in both windows/);
  }
  assert.deepEqual(r.movedSurfaces, []);
});

test("surfaces moving in opposite directions withhold the pool", () => {
  // Synthetic: matched volumes so only the disagreement can trigger it.
  const r = computeComparison({
    sharedKeywords: 20,
    perSurface: [
      { engine: "gemini",     prevRuns: 400, prevHits: 120, curRuns: 400, curHits: 100 },
      { engine: "perplexity", prevRuns: 400, prevHits: 100, curRuns: 400, curHits: 120 },
    ],
    ...WINDOWS,
  });
  const w = withheld(r.pooled.citation);
  assert.match(w.reason, /opposite directions/);
  assert.match(w.reason, /describes none of them/);
});

test("an unrecognised engine is 'unknown' and joins no pool", () => {
  // The engine-label drift that shipped a client a report one surface short.
  const r = computeComparison({
    sharedKeywords: 10,
    perSurface: [{ engine: "ChatGPT", prevRuns: 100, prevHits: 10, curRuns: 100, curHits: 20 }],
    ...WINDOWS,
  });
  assert.equal(r.perSurface[0].layer, "unknown");
  assert.match(withheld(r.pooled.citation).reason, /no citation surface was measured/);
});

test("describeMovement cannot print numbers for a withheld movement", () => {
  const w = describeMovement({ kind: "withheld", reason: "the basis changed" }, "Perplexity");
  assert.match(w, /no movement can be stated because the basis changed/);
  assert.doesNotMatch(w, /\d+\.\d+%/);

  const s = describeMovement({ kind: "stated", prevRate: 28.0, curRate: 22.5, deltaPp: -5.5 }, "Gemini");
  assert.equal(s, "Gemini: 28.0% to 22.5%, down 5.5 percentage points.");

  const flat = describeMovement({ kind: "stated", prevRate: 21.7, curRate: 21.6, deltaPp: -0.1 }, "Gemma");
  assert.equal(flat, "Gemma: 21.7% to 21.6%, flat.");
});

/* ── Basis and event relevance, added 2026-10-01 ─────────────────────────
 *
 * The paying client's October memo compares against September, and September
 * carries three events: the client lost 12 questions on 09-23 and got them
 * back on 09-24, a laptop bridge overwrote readout snapshots on 09-23, and
 * extra sweeps inflated volume 09-01 to 09-03. Before this, any one of them
 * withheld every figure, so the decided basis could never have been used.
 */
import { stableCore, type ComparisonBasis } from "../src/lib/compare-periods";

const SEPT_EVENTS: InstrumentEvent[] = [
  { occurred_at: 1788220800, kind: "backfill", scope: "global", detail: "Extra sweeps 09-01 to 09-03 inflated run volume." },
  { occurred_at: 1789257600, kind: "question_set_changed", scope: "client", client_slug: "client-a", detail: "lost 12 of 30" },
  { occurred_at: 1789344000, kind: "question_set_changed", scope: "client", client_slug: "client-a", detail: "12 restored" },
  { occurred_at: 1789257600, kind: "snapshot_overwritten", scope: "global", detail: "bridge overwrote readout snapshots" },
];

/* Synthetic, stable on every surface, so only the events can withhold it. */
const CALM: SurfaceCounts[] = [
  { engine: "perplexity",         prevRuns: 500, prevHits: 100, curRuns: 505, curHits: 101 },
  { engine: "openai",             prevRuns: 500, prevHits: 50,  curRuns: 498, curHits: 50 },
  { engine: "gemini",             prevRuns: 500, prevHits: 80,  curRuns: 502, curHits: 81 },
  { engine: "google_ai_overview", prevRuns: 300, prevHits: 30,  curRuns: 301, curHits: 30 },
  { engine: "anthropic",          prevRuns: 500, prevHits: 40,  curRuns: 500, curHits: 41 },
  { engine: "gemma",              prevRuns: 500, prevHits: 45,  curRuns: 499, curHits: 45 },
  { engine: "bing",               prevRuns: 500, prevHits: 5,   curRuns: 500, curHits: 5 },
];

const run = (basis: ComparisonBasis, events = SEPT_EVENTS) =>
  computeComparison({
    basis,
    sharedKeywords: 18,
    perSurface: CALM,
    curWindow: { start: 0, end: 1 },
    prevWindow: { start: 0, end: 1 },
    events,
  });

test("stableCore returns the paying client's 18 from September's real coverage pattern", () => {
  const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
  const m = new Map<string, Set<string>>();
  for (let i = 0; i < 18; i++) m.set(`orig-${i}`, new Set(days));
  for (let i = 0; i < 12; i++) m.set(`added-${i}`, new Set(days.filter((d) => d !== "2026-09-01" && d !== "2026-09-24")));
  const core = stableCore(m);
  assert.equal(core.length, 18);
  assert.ok(core.every((k) => k.startsWith("orig-")));
});

test("a day nobody was measured does not knock everyone out of the core", () => {
  // A fleet-wide outage is the instrument missing a day, not the question.
  const m = new Map([
    ["a", new Set(["d1", "d3"])],
    ["b", new Set(["d1", "d3"])],
  ]);
  assert.deepEqual(stableCore(m).sort(), ["a", "b"]);
  assert.deepEqual(stableCore(new Map()), []);
});

test("on the stable core, September's events set aside and the figures are stated", () => {
  const c = run("stable_core");
  assert.equal(c.events.length, 0);
  assert.equal(c.setAside.length, 4);
  stated(c.pooled.citation);
  stated(c.pooled.model_knowledge);
  assert.equal(c.basis.kind, "stable_core");
});

test("on the shared basis, a client's question-set change still withholds", () => {
  // The default basis includes the questions that changed. Nothing about the
  // stable-core exemption may leak into it.
  const c = run("shared");
  assert.equal(c.events.length, 2);
  assert.ok(c.events.every((e) => e.kind === "question_set_changed"));
  assert.match(withheld(c.pooled.citation).reason, /question_set_changed/);
});

test("an engine change still withholds on any basis", () => {
  const c = run("stable_core", [
    ...SEPT_EVENTS,
    { occurred_at: 1789257600, kind: "engine_adapter_changed", scope: "engine", engine: "perplexity", detail: "Agent API" },
  ]);
  withheld(c.perSurface.find((s) => s.engine === "perplexity")!.movement);
  withheld(c.pooled.citation);
  stated(c.pooled.model_knowledge);
});

test("an unrecognised event kind still withholds: the default is refusal", () => {
  const c = run("stable_core", [{ occurred_at: 1, kind: "something_new", scope: "global", detail: "?" }]);
  withheld(c.pooled.citation);
  withheld(c.pooled.model_knowledge);
});

test("a backfill big enough to matter is still refused, by the volume check", () => {
  // HTC 2026-09-02: 467 runs against a ~133/day baseline. Over one week that
  // is far past the skew limit, so setting the event aside loses nothing.
  const week = 133 * 7;
  const spiked = week - 133 + 467;
  const c = computeComparison({
    sharedKeywords: 22,
    perSurface: [
      { engine: "perplexity", prevRuns: Math.round(spiked / 2), prevHits: 100, curRuns: Math.round(week / 2), curHits: 70 },
      { engine: "gemini",     prevRuns: Math.round(spiked / 2), prevHits: 100, curRuns: Math.round(week / 2), curHits: 70 },
    ],
    curWindow: { start: 0, end: 1 },
    prevWindow: { start: 0, end: 1 },
    events: [SEPT_EVENTS[0]],
  });
  assert.equal(c.setAside.length, 1);
  assert.match(withheld(c.pooled.citation).reason, /fewer queries/);
});

test("a stored-answer cap change is set aside for citations, with the reason", () => {
  // 2026-09-16: cap 4,000 -> 12,000. client_cited comes from structured
  // citations, so a citation comparison is unaffected; the named rate is not.
  const c = computeComparison({
    sharedKeywords: 18,
    perSurface: [{ engine: "openai", prevRuns: 500, prevHits: 60, curRuns: 500, curHits: 61 }],
    prevWindow: { start: 0, end: 1 },
    curWindow: { start: 1, end: 2 },
    events: [{ occurred_at: 1789554300, kind: "response_capture_changed", scope: "global", detail: "cap raised" }],
  });
  assert.equal(c.events.length, 0);
  assert.match(c.setAside[0].why, /not citation counts/);
  stated(c.perSurface[0].movement);
});

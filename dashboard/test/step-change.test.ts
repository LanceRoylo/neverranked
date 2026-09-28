/* The step detector, pinned to the event it was built for.
 *
 * Every window below is real, pulled from D1 on 2026-09-27 around the
 * Perplexity Agent API migration of 2026-08-23. Two of these cases exist
 * because the first design was wrong about them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectStep, describeStep, MIN_RUNS, WINDOW_DAYS } from "../src/lib/step-change";

/* hawaii-theatre, perplexity, 14-day windows either side of 2026-08-23. */
const HTC_14D = {
  clientSlug: "hawaii-theatre",
  engine: "perplexity",
  before: { runs: 317, hits: 188 }, // 59.31%
  after: { runs: 440, hits: 210 },  // 47.73%
};

test("it finds the migration it was built to find", () => {
  const f = detectStep(HTC_14D)!;
  assert.ok(f, "the Perplexity step must be detected");
  assert.equal(f.beforeRate.toFixed(1), "59.3");
  assert.equal(f.afterRate.toFixed(1), "47.7");
  assert.equal(f.deltaPp.toFixed(1), "-11.6");
  assert.equal(Math.abs(f.z).toFixed(1), "3.2");
});

test("seven-day windows cannot see it, which is why the window is fourteen", () => {
  // The same client and surface, 7-day windows: 57.63% of 118 runs against
  // 48.82% of 211. An 8.8 point move at z = 1.6, indistinguishable from noise.
  const sevenDay = {
    clientSlug: "hawaii-theatre",
    engine: "perplexity",
    before: { runs: 118, hits: 68 },
    after: { runs: 211, hits: 103 },
  };
  assert.equal(detectStep(sevenDay), null);
  assert.ok(WINDOW_DAYS === 14, "the window exists because of this case");
});

test("pooling clients hides the step, so the detector must never be given a pool", () => {
  // Every client together across the same migration: 34.75% of 282 runs to
  // 33.19% of 464. hawaii-theatre's fall is cancelled by and-scene rising and
  // growing in volume. A detector fed this reports all-clear.
  const pooled = {
    clientSlug: "_all",
    engine: "perplexity",
    before: { runs: 282, hits: 98 },
    after: { runs: 464, hits: 154 },
  };
  assert.equal(detectStep(pooled), null);
});

test("a client that moved the other way is not dragged into a finding", () => {
  // and-scene over the same window: 30.95% to 34.93%, and under MIN_RUNS.
  const andScene = {
    clientSlug: "and-scene",
    engine: "perplexity",
    before: { runs: 84, hits: 26 },
    after: { runs: 146, hits: 51 },
  };
  assert.equal(detectStep(andScene), null);
});

test("thin windows are refused rather than guessed at", () => {
  const thin = {
    clientSlug: "prince-waikiki",
    engine: "perplexity",
    before: { runs: 19, hits: 4 },
    after: { runs: MIN_RUNS + 50, hits: 10 },
  };
  assert.equal(detectStep(thin), null);
});

test("a window with no runs is not a zero rate", () => {
  const none = {
    clientSlug: "neverranked",
    engine: "perplexity",
    before: { runs: 0, hits: 0 },
    after: { runs: 500, hits: 250 },
  };
  assert.equal(detectStep(none), null);
});

test("a surface that is never cited produces no signal and no divide by zero", () => {
  // neverranked's own perplexity rate was 0 of 61 then 0 of 107, really zero.
  const flatZero = {
    clientSlug: "neverranked",
    engine: "perplexity",
    before: { runs: 400, hits: 0 },
    after: { runs: 400, hits: 0 },
  };
  const f = detectStep(flatZero);
  assert.equal(f, null);
});

test("a big sample with a tiny move does not raise an alarm", () => {
  // Statistically clean, commercially meaningless: 40.0% to 42.0% on 20k runs.
  const drift = {
    clientSlug: "hawaii-theatre",
    engine: "gemini",
    before: { runs: 20000, hits: 8000 },
    after: { runs: 20000, hits: 8400 },
  };
  assert.equal(detectStep(drift), null, "under MIN_PP even though z is large");
});

test("a rise is detected as readily as a fall", () => {
  const rise = {
    clientSlug: "hawaii-theatre",
    engine: "perplexity",
    before: { runs: 440, hits: 210 },
    after: { runs: 317, hits: 188 },
  };
  const f = detectStep(rise)!;
  assert.ok(f.deltaPp > 0);
  assert.ok(f.z > 0);
});

test("the written row states the move and refuses to state a cause", () => {
  const d = describeStep(detectStep(HTC_14D)!);
  assert.match(d, /perplexity citation rate for hawaii-theatre fell 59\.3% to 47\.7%/);
  assert.match(d, /11\.6pp, z=3\.2/);
  assert.match(d, /317 then 440 runs/);
  assert.match(d, /Cause unknown/);
  // The detector sees a step in a number. Naming the adapter would be the same
  // failure it exists to catch.
  assert.doesNotMatch(d, /Agent API|because|caused by/i);
  assert.match(d, /not like-for-like until it is explained/);
});

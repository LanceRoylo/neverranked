import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNoiseBand,
  movementIsReportable,
  MIN_RUNS_PER_DAY,
  type DailyRate,
} from "../src/lib/noise-floor";

/* How small a movement may this instrument claim?
 *
 * RUNS_PER_KEYWORD = 1, so there are no same-moment replicates and nothing has
 * ever separated "the engine answered differently" from "the world changed".
 *
 * The fixtures below are the real 21-day production shapes measured 2026-09-15.
 * Slugs are anonymised: this repo is public and per-client figures belong in
 * the private docs repo.
 *
 *     client A   mean 43.2%, sd 3.65pp, range 34.7 to 50.0
 *     client B   mean  8.0%, sd 2.22pp, range  4.9 to 12.0  */

// 600 runs a day so the fixture is not distorted by integer rounding of the
// cited count, which at 60 runs quantises every percentage to 1.67pp steps.
const day = (i: number, pct: number, runs = 600): DailyRate => ({
  day: `2026-09-${String(i + 1).padStart(2, "0")}`,
  runs,
  cited: Math.round((pct / 100) * runs),
});

/** Client B: the one whose reported figure swings seven points unaided. */
const CLIENT_B = [4.9, 6.1, 7.0, 8.2, 9.4, 12.0, 8.8, 7.3, 6.6, 9.9, 10.4, 8.1, 5.5, 9.0].map(
  (p, i) => day(i, p),
);

test("a band is computed from real production spread", () => {
  const b = computeNoiseBand(CLIENT_B);
  assert.ok(b !== null);
  assert.equal(b.days, 14);
  // Two standard deviations of a series that ranges 4.9 to 12.0 is several
  // points. The exact value moves with the fixture; what matters is that it is
  // large enough to forbid the four-point claim that prompted this file.
  // Computed, not guessed: sd of this series is ~2.0pp, so the band is 4.0pp.
  assert.equal(b.bandPp, 4);
  assert.ok(b.observedRangePp >= 7, `range ${b.observedRangePp}`);
});

test("a move inside the band is NOT reportable for this client", () => {
  // The whole reason the file exists. The band lands at 4.0pp, so anything
  // under it is the instrument breathing and may not be called a result.
  const b = computeNoiseBand(CLIENT_B);
  assert.equal(movementIsReportable(3.5, b), false);
  assert.equal(movementIsReportable(-3.5, b), false);
  // At the boundary it is allowed. The band is a threshold, not a taboo.
  assert.equal(movementIsReportable(4, b), true);
});

test("a large move still is", () => {
  const b = computeNoiseBand(CLIENT_B);
  assert.equal(movementIsReportable(15, b), true);
  assert.equal(movementIsReportable(-15, b), true);
});

test("too few days yields null, and null blocks the claim", () => {
  // Null means "cannot tell". It must never behave like a band of zero, which
  // would license reporting every flicker as a result.
  const b = computeNoiseBand(CLIENT_B.slice(0, 3));
  assert.equal(b, null);
  assert.equal(movementIsReportable(50, b), false);
});

test("thin days are excluded rather than allowed to inflate the band", () => {
  // A day with 3 runs can only report 0, 33, 66 or 100 percent. Including it
  // would add arithmetic noise and call it instrument noise.
  const withThin = [...CLIENT_B, { day: "2026-09-30", runs: MIN_RUNS_PER_DAY - 1, cited: 0 }];
  const a = computeNoiseBand(CLIENT_B);
  const c = computeNoiseBand(withThin);
  assert.ok(a && c);
  assert.equal(a.days, c.days);
  assert.equal(a.bandPp, c.bandPp);
});

test("a perfectly flat client gets a zero band, and that is honest", () => {
  // Our own domain sat at 0.0% for 21 straight days. Zero variance is a real
  // observation about a client never cited, not a licence to claim precision,
  // so any nonzero movement clears it and gets reported.
  const flat = Array.from({ length: 14 }, (_, i) => day(i, 0));
  const b = computeNoiseBand(flat);
  assert.ok(b !== null);
  assert.equal(b.sdPp, 0);
  assert.equal(b.bandPp, 0);
  assert.equal(movementIsReportable(1, b), true);
});

test("the basis never calls itself precision", () => {
  const b = computeNoiseBand(CLIENT_B);
  assert.ok(b !== null);
  assert.match(b.basis, /upper bound/);
  assert.match(b.basis, /cannot be separated without replicate runs/);
  // "precision" may appear ONLY inside its own denial. The failure mode is a
  // memo describing this as the instrument's precision, which it is not.
  assert.match(b.basis, /not a precision figure/);
  for (const forbidden of ["confidence interval", "margin of error"]) {
    assert.ok(!b.basis.toLowerCase().includes(forbidden), `basis must not say "${forbidden}"`);
  }
});

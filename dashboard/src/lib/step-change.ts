/**
 * step-change.ts — catches an instrument change nobody wrote down.
 *
 * NOT YET WIRED. Built alongside instrument_events (migration 0126) and
 * compare-periods.ts, ahead of the 2026-10-15 boundary.
 *
 * WHY. instrument_events depends on somebody remembering to log the day they
 * changed an engine adapter, and the day you change an adapter is the day you
 * are thinking about the adapter. The row that matters most is the one most
 * likely to be missing. This is the backstop: it finds the step in the data and
 * writes the row itself, with source='detector'.
 *
 * It is how the Perplexity Agent API migration of 2026-08-23 was actually
 * found: by eye, from a daily series, 35 days later, one day before the wrong
 * number reached a client.
 *
 * TWO THINGS THE REAL DATA SETTLED, both of which contradicted the first guess:
 *
 * 1. IT MUST RUN PER CLIENT, NOT POOLED. Pooled across every client, Perplexity
 *    went 34.75% to 33.19% across the migration, a 1.6 point wobble that no
 *    detector should fire on. Per client, hawaii-theatre fell 57.63% to 48.82%
 *    while and-scene ROSE 30.95% to 34.93% and grew in volume, cancelling it
 *    out. Pooling hides the step for the same reason pooling hides everything
 *    else here: the mix moves underneath it.
 *
 * 2. FOURTEEN DAYS, NOT SEVEN. On 7-day windows hawaii-theatre's Perplexity
 *    step is z = 1.6, which is noise. On 14-day windows it is z = 3.2. Seven
 *    days does not have the power, and a detector that cannot see the one event
 *    it was built for is worse than none, because it reads as an all-clear.
 *
 * The honest consequence of 14-day windows: this finds a step roughly two weeks
 * after it happens, not two days. That is still 21 days earlier than we managed
 * by hand, and the window cannot be shortened without losing the signal.
 */

/** Counts for one surface, one client, over one window. */
export interface Window {
  runs: number;
  hits: number;
}

export interface StepCandidate {
  clientSlug: string;
  engine: string;
  before: Window;
  after: Window;
}

export interface StepFinding {
  clientSlug: string;
  engine: string;
  beforeRate: number;
  afterRate: number;
  deltaPp: number;
  /** Standard deviations between the two rates. Sign follows the delta. */
  z: number;
  runsBefore: number;
  runsAfter: number;
}

/** Days per window. See note 2 above: seven is not enough. */
export const WINDOW_DAYS = 14;
/**
 * Minimum runs in EACH window. Below this the binomial error is wide enough
 * that a real step and a quiet fortnight are indistinguishable.
 * hawaii-theatre had 317 and 440 across the Perplexity migration.
 */
export const MIN_RUNS = 200;
/** Standard deviations required. The migration sits at 3.2. */
export const MIN_Z = 3;
/**
 * Minimum absolute move, so a statistically clean but commercially
 * uninteresting drift on a huge sample does not raise an alarm every fortnight.
 */
export const MIN_PP = 5;

/**
 * Test one client-and-surface pair for a step.
 *
 * Returns null rather than a "no step" object: a non-finding is not a finding,
 * and giving it a shape invites a caller to render it.
 */
export function detectStep(c: StepCandidate): StepFinding | null {
  const { before, after } = c;

  // A window with no runs has no rate. It is not a 0% rate, and the difference
  // between "we did not measure" and "we measured nothing" is the distinction
  // this whole codebase keeps having to relearn.
  if (before.runs <= 0 || after.runs <= 0) return null;
  if (before.runs < MIN_RUNS || after.runs < MIN_RUNS) return null;

  const pB = before.hits / before.runs;
  const pA = after.hits / after.runs;
  const deltaPp = (pA - pB) * 100;
  if (Math.abs(deltaPp) < MIN_PP) return null;

  // Binomial standard error on each side, combined. Using the daily rates'
  // spread instead would have missed this: Perplexity's day-to-day scatter is
  // wide enough to swallow its own step.
  const seB = Math.sqrt((pB * (1 - pB)) / before.runs);
  const seA = Math.sqrt((pA * (1 - pA)) / after.runs);
  const se = Math.sqrt(seB * seB + seA * seA);
  if (se === 0) return null; // both windows all-hit or all-miss; no signal

  const z = (pA - pB) / se;
  if (Math.abs(z) < MIN_Z) return null;

  return {
    clientSlug: c.clientSlug,
    engine: c.engine,
    beforeRate: pB * 100,
    afterRate: pA * 100,
    deltaPp,
    z,
    runsBefore: before.runs,
    runsAfter: after.runs,
  };
}

/**
 * The `detail` for the instrument_events row.
 *
 * Deliberately says "something changed" and never why. The detector sees a step
 * in a number; it does not know whether we changed an adapter, the engine
 * changed its model, or the client's category moved. Naming a cause here would
 * be the same failure this module exists to catch, one level up.
 */
export function describeStep(f: StepFinding): string {
  const dir = f.deltaPp < 0 ? "fell" : "rose";
  return (
    `${f.engine} citation rate for ${f.clientSlug} ${dir} ` +
    `${f.beforeRate.toFixed(1)}% to ${f.afterRate.toFixed(1)}% ` +
    `(${Math.abs(f.deltaPp).toFixed(1)}pp, z=${Math.abs(f.z).toFixed(1)}) ` +
    `across ${f.runsBefore} then ${f.runsAfter} runs over ${WINDOW_DAYS}-day windows. ` +
    `Cause unknown: check for an adapter change, an engine-side change, or a real move. ` +
    `Comparisons spanning this date are not like-for-like until it is explained.`
  );
}

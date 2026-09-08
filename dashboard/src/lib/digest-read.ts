/**
 * digest-read.ts — the interpretation layer for the weekly digest.
 *
 * WHY THIS EXISTS. The digest rendered its figures and then defined them.
 * It never said what they meant. The content grader held six consecutive
 * sends for one client over six days on that exact ground, with the same
 * verdict each time: "'The numbers' just displays three metrics with a
 * definition, no analysis" and the figures "tell reader nothing about
 * trend, change, or what to do". The grader was right.
 *
 * Per-client figures stay in the private docs repo.
 *
 * Because a held send stays due, the same unsendable digest was rebuilt and
 * re-graded every 24 hours. Fixing the content is what breaks that loop.
 *
 * DETERMINISTIC ON PURPOSE. The readout prose is written by a model under
 * the allowedNumbers() guard. This is not. Everything the grader asked for
 * is already structured data on ClientWeek, so interpretation here is
 * arithmetic, not writing. That means no second hallucination surface to
 * maintain, no model call on a path that retries daily, and no figure can
 * be invented: every number emitted below is a ClientWeek field or a
 * subtraction of two of them.
 *
 * NOT A SECOND VERDICT. weekReport() already leads the email with the
 * largest movement. Restating direction two inches below itself is the
 * padding the grader calls filler. So each metric states direction ONLY
 * when movedItems() did not already claim it, which is exactly the
 * sub-threshold case the verdict is silent about.
 */

import { movedItems, type ClientWeek } from "../digest-verdict";

const pct = (v: number): number => Math.round(v * 100);
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export interface DigestRead {
  /** One sentence per figure the numbers panel renders, in the same order. */
  lines: string[];
  /** No prior reading exists for either outcome metric. */
  baseline: boolean;
}

/**
 * Plain-language read of the figures the numbers panel shows.
 *
 * Answers the three questions the grader asks of every metric: what does
 * this number mean against its own denominator, did it change, and is that
 * something to act on. Works with no prior reading, which is the baseline
 * case a first-month client is always in.
 */
export function readNumbers(c: ClientWeek): DigestRead {
  const moved = movedItems(c);
  const claimed = new Set(moved.map((m) => m.kind));
  const lines: string[] = [];
  const baseline = c.sharePrev === null && c.scorePrev === null;

  // SHARE. The denominator is the whole point and the figure is meaningless
  // without it. "10%" invites the reader to hear "10% of answers", which is
  // the model-knowledge layer and a different measurement entirely.
  if (c.share !== null) {
    const now = pct(c.share);
    let line = `Out of every 100 sources these tools cited across your tracked questions, about ${now} pointed to your site.`;
    if (c.sharePrev === null) {
      line += " This is the first reading, so there is nothing yet to compare it against. The next one gives it a baseline.";
    } else if (!claimed.has("share")) {
      const diff = now - pct(c.sharePrev);
      line +=
        diff === 0
          ? ` That held exactly where it was last reading, at ${pct(c.sharePrev)}%.`
          : ` That is ${Math.abs(diff)} ${plural(Math.abs(diff), "point", "points")} ${diff > 0 ? "above" : "below"} the last reading, small enough that the method treats it as weather rather than a change to act on.`;
    }
    lines.push(line);
  }

  // COVERAGE. Naming what the gap IS turns a ratio into a finding. The
  // reader does not need to be told the definition of coverage if the
  // sentence shows them the questions they lost.
  if (c.coverageWon !== null && c.coverageTotal !== null && c.coverageTotal > 0) {
    const missed = c.coverageTotal - c.coverageWon;
    lines.push(
      missed <= 0
        ? `You were cited on all ${c.coverageTotal} tracked ${plural(c.coverageTotal, "question", "questions")}. Share is where the remaining ground is, because being cited once on a question and being cited often are different results.`
        : `You were cited on ${c.coverageWon} of ${c.coverageTotal} tracked questions. On the other ${missed}, these tools answered without pointing to you at all.`,
    );
  }

  // READINESS. Input versus outcome is the distinction that makes the whole
  // panel legible, and it is the one the reader is least likely to arrive
  // with. Stated once, in place, every time.
  let score = "Readiness measures what your own site makes easy for these tools to read. It is the input. Share and coverage are the outcome.";
  if (!claimed.has("score")) {
    if (c.scorePrev === null) {
      score += ` Yours is ${c.score} out of 100.`;
    } else {
      const diff = c.score - c.scorePrev;
      score +=
        diff === 0
          ? ` Yours held at ${c.score} out of 100.`
          : ` Yours moved ${Math.abs(diff)} ${plural(Math.abs(diff), "point", "points")} ${diff > 0 ? "up" : "down"} to ${c.score} out of 100.`;
    }
  }
  lines.push(score);

  // THE QUIET READING. A flat reading is a result. Saying so is the
  // difference between an email with nothing in it and an email that
  // reports stability, and it matches the methodology the client signed,
  // which calls movement between readings weather and says not to act on it.
  if (moved.length === 0) {
    lines.push(
      "Nothing moved enough this reading to act on. The method treats small movement between readings as weather, so a flat reading is a result rather than a gap in the data.",
    );
  }

  return { lines, baseline };
}

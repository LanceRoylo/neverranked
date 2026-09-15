/**
 * noise-floor.ts — how small a movement is this instrument allowed to claim?
 *
 * WHY THIS EXISTS. `RUNS_PER_KEYWORD = 1`. There are no same-moment replicates
 * anywhere in the measurement, so nothing has ever separated "the engine
 * answered differently today" from "the world changed". The monthly memo
 * reports movement in percentage points and had no idea what a percentage point
 * was worth.
 *
 * Measured 2026-09-15 on 21 days of production data, on question sets that did
 * not change during the window:
 *
 *     client A   mean 43.2%, sd 3.65pp, observed range 34.7 to 50.0
 *     client B   mean  8.0%, sd 2.22pp, observed range  4.9 to 12.0
 *
 * Client B's reported figure moves seven points across three weeks with nobody
 * touching anything. A memo saying "up four points this month" would have been
 * reporting the instrument breathing.
 *
 * WHAT THIS IS, EXACTLY, AND WHAT IT IS NOT.
 *
 * Day-to-day spread is instrument noise PLUS real-world change. The two are
 * confounded and cannot be separated without replicates. So this is an UPPER
 * BOUND on noise, and therefore a CONSERVATIVE band: it will occasionally
 * suppress a real movement, and it will never manufacture one. That asymmetry
 * is deliberate and is the correct direction for a company whose product is
 * being believed.
 *
 * It must never be described as precision, or as a confidence interval, or as
 * the instrument's error. It is "the range this number moves on its own". When
 * true replicates exist, this file gets replaced by a real floor and the
 * language tightens. Until then the honest word is "at most".
 */

/** One day's reading for a client: how many runs, how many cited. */
export interface DailyRate {
  day: string;
  runs: number;
  cited: number;
}

export interface NoiseBand {
  /** Days that met the minimum-runs bar and were used. */
  days: number;
  meanPct: number;
  /** Standard deviation of the daily percentage, in percentage points. */
  sdPp: number;
  /** The reporting band. A movement smaller than this may not be called a
   *  movement. Two standard deviations, rounded up to one decimal. */
  bandPp: number;
  observedRangePp: number;
  /** Plain-language basis, carried into the memo so the author cannot
   *  paraphrase it into a precision claim. */
  basis: string;
}

/** Below this, a day's sample is too thin for its percentage to mean anything
 *  and including it would inflate the band with arithmetic rather than noise. */
export const MIN_RUNS_PER_DAY = 20;

/** Fewer days than this and a standard deviation is not worth computing. */
export const MIN_DAYS = 7;

/**
 * Pure. Returns null when there is not enough data, and null must be treated as
 * "we cannot say", NOT as "the band is zero". A zero band would license
 * reporting every one-point flicker as a result, which is the failure this
 * whole file exists to prevent.
 */
export function computeNoiseBand(rates: DailyRate[]): NoiseBand | null {
  const pct = rates
    .filter((r) => r.runs >= MIN_RUNS_PER_DAY)
    .map((r) => (100 * r.cited) / r.runs);
  if (pct.length < MIN_DAYS) return null;

  const mean = pct.reduce((a, b) => a + b, 0) / pct.length;
  const variance = pct.reduce((a, b) => a + (b - mean) ** 2, 0) / (pct.length - 1);
  const sd = Math.sqrt(variance);
  const band = Math.ceil(2 * sd * 10) / 10;

  return {
    days: pct.length,
    meanPct: +mean.toFixed(1),
    sdPp: +sd.toFixed(2),
    bandPp: band,
    observedRangePp: +(Math.max(...pct) - Math.min(...pct)).toFixed(1),
    basis:
      `day-to-day spread of this client's own daily readings over ${pct.length} days. ` +
      `This is an upper bound on instrument noise, not a precision figure: daily ` +
      `variation contains real change as well as instrument variation, and the two ` +
      `cannot be separated without replicate runs, which the measurement does not ` +
      `currently take.`,
  };
}

/**
 * Is a reported movement large enough to be called one?
 *
 * A null band means we cannot tell, and cannot-tell blocks the claim. Refusing
 * to describe a movement is recoverable. Describing noise as a result is the
 * thing that ends a measurement company.
 */
export function movementIsReportable(deltaPp: number, band: NoiseBand | null): boolean {
  if (band === null) return false;
  return Math.abs(deltaPp) >= band.bandPp;
}

/**
 * Daily readings for one client, most recent `days` back.
 *
 * Deliberately NOT scoped to the report month. A band computed from the same
 * weeks it is policing would shrink whenever the month happened to be quiet,
 * which is exactly when a small fake movement is most tempting to report.
 */
export async function fetchDailyRates(
  env: { DB: D1Database },
  clientSlug: string,
  days = 21,
): Promise<DailyRate[]> {
  const rows = (await env.DB.prepare(
    `SELECT date(r.run_at,'unixepoch') AS day,
            COUNT(*)                  AS runs,
            SUM(r.client_cited)       AS cited
       FROM citation_runs r
       JOIN citation_keywords k ON k.id = r.keyword_id
      WHERE k.client_slug = ?
        AND k.active = 1
        AND r.run_at >= strftime('%s','now') - ? * 86400
      GROUP BY day
      ORDER BY day`,
  ).bind(clientSlug, days).all<DailyRate>()).results;
  return rows ?? [];
}

/**
 * engine-peer-health.ts — is a surface keeping up with its siblings?
 *
 * WHY THIS EXISTS (2026-08-30). anomaly-detection compares each engine to a
 * 14-day rolling average OF ITSELF. That cannot see a degradation that
 * persists, because the degraded days walk into the baseline and lower the
 * bar. OpenAI ran at roughly a quarter of the other surfaces for six days and
 * the detector's threshold fell 21.5 -> 18 -> 15.6 behind it until the
 * shortfall cleared the bar and the daily cron reported `degraded=0`:
 *
 *     anthropic 61  bing 61  gemini 61  gemma 61  perplexity 60
 *     google_ai_overview 46  openai 17        <- "normal"
 *
 * A self-referential baseline goes quiet exactly when a problem becomes
 * chronic. Only a cliff trips it, and only once.
 *
 * Every surface is asked the same question set on the same schedule, so the
 * honest invariant is cross-sectional, not historical: on any given day they
 * should all produce about the same number of rows. Comparing an engine to
 * the MEDIAN OF ITS PEERS is immune to drift, because the peers are healthy
 * whether or not the laggard is.
 *
 * The median (not the mean) is deliberate: it does not move when one or two
 * engines collapse, which is precisely the case this must survive.
 *
 * ONE computation, TWO consumers (the detector and the morning digest). The
 * recurring defect in this codebase is a single fact written down twice and
 * drifting apart -- engine keys did it, Atlas's punt line did it -- so the
 * number the digest prints is the number the alert fires on, by construction.
 */
import type { Env } from "../types";

/** Below this share of the peer median, a surface is degraded. Loose on
 *  purpose: Google AI Overviews legitimately declines to render on a large
 *  minority of questions, and that must not read as an outage. */
export const PEER_DEGRADED_RATIO = 0.5;

/** Do not judge anyone on a quiet day. If the median itself is tiny the whole
 *  fleet is idle (holiday cron, deploy window) and ratios are meaningless. */
export const PEER_MIN_MEDIAN = 20;

export type PeerHealth = {
  engine: string;
  rows: number;
  median: number;
  /** Share of the peer median, 0..n. */
  pct: number;
  degraded: boolean;
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Row counts per engine since `sinceTs`, each scored against the median of
 *  all engines in the same window. Returns [] when the fleet is too quiet to
 *  judge, which callers must treat as "no opinion", NOT as "all healthy". */
/** Surfaces that are NOT comparable to a peer median, and are watched against
 *  their own history instead.
 *
 *  Google AI Overviews does not render for every query. It chooses, and on our
 *  roster it renders for roughly 40-60% of them. Holding it beside engines that
 *  answer everything and calling the difference degradation is a category
 *  error, and it produced an `anomaly_engine_peer_drop` alert every single day
 *  from 2026-09-12 onward. report-facts already knows this and says so in
 *  MIN_ENGINE_DENSITY: "AIO sits at 42% too and is perfectly healthy, because
 *  it legitimately declines to render." The alerting layer did not know, which
 *  is this codebase's signature failure -- a rule written in one place and not
 *  applied to its neighbour.
 *
 *  NOTHING IS LOST BY REMOVING IT FROM THIS CHECK. The row-drop detector in
 *  anomaly-detection.ts compares every engine against its OWN prior-days
 *  average, so a real AIO outage still alarms: it did on 2026-09-13, alert 332.
 *  What stops is a daily alert for behaving exactly as designed, and an alert
 *  that fires every day is one nobody reads.
 *
 *  Do not add an engine here to quieten it. The test is whether a peer median
 *  is the right yardstick at all, not whether the alert is annoying. */
const SELF_BASELINE_ENGINES = new Set(["google_ai_overview"]);

export async function assessPeerHealth(env: Env, sinceTs: number): Promise<PeerHealth[]> {
  const rows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) AS n FROM citation_runs WHERE run_at >= ? GROUP BY engine`,
  ).bind(sinceTs).all<{ engine: string; n: number }>()).results;

  const counts = rows
    .filter((r) => typeof r.engine === "string")
    .map((r) => ({ engine: String(r.engine), rows: Number(r.n) || 0 }));

  // The yardstick is built from comparable surfaces only. A self-baseline
  // engine is still REPORTED -- the digest should show its row count, and
  // hiding it would trade one blind spot for another -- it is simply never
  // judged against a median that does not describe it.
  const peers = counts.filter((c) => !SELF_BASELINE_ENGINES.has(c.engine));
  if (peers.length < 3) return []; // too few comparable surfaces to define a peer group

  const med = median(peers.map((c) => c.rows));
  if (med < PEER_MIN_MEDIAN) return []; // fleet-wide quiet: not this check's business

  return counts
    .map((c) => ({
      engine: c.engine,
      rows: c.rows,
      median: med,
      pct: c.rows / med,
      degraded: !SELF_BASELINE_ENGINES.has(c.engine) && c.rows < med * PEER_DEGRADED_RATIO,
    }))
    .sort((a, b) => a.pct - b.pct);
}

/** One-line summary for the morning digest HEALTH block. */
export function summarizePeerHealth(health: PeerHealth[]): string {
  if (!health.length) return "not assessed (fleet quiet)";
  const bad = health.filter((h) => h.degraded);
  if (!bad.length) return `0 of ${health.length}`;
  return `${bad.length} of ${health.length} — ` +
    bad.map((h) => `${h.engine} ${Math.round(h.pct * 100)}%`).join(", ");
}

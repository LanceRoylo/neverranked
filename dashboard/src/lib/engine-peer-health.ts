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
export async function assessPeerHealth(env: Env, sinceTs: number): Promise<PeerHealth[]> {
  const rows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) AS n FROM citation_runs WHERE run_at >= ? GROUP BY engine`,
  ).bind(sinceTs).all<{ engine: string; n: number }>()).results;

  const counts = rows
    .filter((r) => typeof r.engine === "string")
    .map((r) => ({ engine: String(r.engine), rows: Number(r.n) || 0 }));
  if (counts.length < 3) return []; // too few surfaces reporting to define a peer group

  const med = median(counts.map((c) => c.rows));
  if (med < PEER_MIN_MEDIAN) return []; // fleet-wide quiet: not this check's business

  return counts
    .map((c) => ({
      engine: c.engine,
      rows: c.rows,
      median: med,
      pct: c.rows / med,
      degraded: c.rows < med * PEER_DEGRADED_RATIO,
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

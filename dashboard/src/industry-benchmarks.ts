/**
 * Phase 6A: Industry benchmark rollup + percentile lookup.
 *
 * We aggregate the latest scan + citation_snapshot per client,
 * group by client_settings.industry, and compute a fixed quartile
 * profile per industry. The dashboard reads from industry_benchmarks
 * to render "you're in the Nth percentile" without re-aggregating
 * on every request.
 *
 * Sample-size discipline: we hide any industry with n<5 in the
 * dashboard. Below that threshold the numbers are noise.
 */

import type { Env } from "./types";

const MIN_SAMPLE = 5;

interface ClientStat {
  client_slug: string;
  industry: string;
  aeo_score: number | null;
  citation_share: number | null;
  schema_coverage_pct: number | null;
}

/** Compute and persist the industry_benchmarks rollup for every
 *  industry that has any tagged clients. Returns the number of
 *  industries written. Safe to call repeatedly (uses INSERT OR
 *  REPLACE on the PRIMARY KEY). */
export async function recomputeIndustryBenchmarks(env: Env): Promise<{
  industriesComputed: number;
  industriesSkipped: number;
}> {
  const stats = await collectClientStats(env);
  const byIndustry = new Map<string, ClientStat[]>();
  for (const s of stats) {
    if (!byIndustry.has(s.industry)) byIndustry.set(s.industry, []);
    byIndustry.get(s.industry)!.push(s);
  }

  const now = Math.floor(Date.now() / 1000);
  let written = 0;
  let skipped = 0;
  for (const [industry, rows] of byIndustry) {
    if (rows.length < MIN_SAMPLE) {
      // Even though we skip writing for the dashboard's sake, we
      // still wipe any stale row so the UI never shows a value
      // computed from a bigger pool that has since shrunk.
      await env.DB.prepare("DELETE FROM industry_benchmarks WHERE industry = ?").bind(industry).run();
      skipped++;
      continue;
    }

    const aeo = rows.map(r => r.aeo_score).filter((n): n is number => n !== null).sort((a, b) => a - b);
    const cs = rows.map(r => r.citation_share).filter((n): n is number => n !== null).sort((a, b) => a - b);
    const sc = rows.map(r => r.schema_coverage_pct).filter((n): n is number => n !== null);

    if (aeo.length < MIN_SAMPLE) { skipped++; continue; }

    await env.DB.prepare(
      `INSERT OR REPLACE INTO industry_benchmarks
        (industry, sample_size, aeo_p25, aeo_median, aeo_p75, aeo_p90,
         citation_p25, citation_median, citation_p75, citation_p90,
         schema_coverage_mean, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      industry, rows.length,
      pct(aeo, 25), pct(aeo, 50), pct(aeo, 75), pct(aeo, 90),
      cs.length >= MIN_SAMPLE ? pct(cs, 25) : null,
      cs.length >= MIN_SAMPLE ? pct(cs, 50) : null,
      cs.length >= MIN_SAMPLE ? pct(cs, 75) : null,
      cs.length >= MIN_SAMPLE ? pct(cs, 90) : null,
      sc.length > 0 ? sc.reduce((a, b) => a + b, 0) / sc.length : null,
      now,
    ).run();
    written++;
  }
  return { industriesComputed: written, industriesSkipped: skipped };
}

async function collectClientStats(env: Env): Promise<ClientStat[]> {
  // One row per client: latest scan + latest citation snapshot.
  // We join on client_settings.industry being non-null so untagged
  // clients are simply not in the pool.
  const settings = (await env.DB.prepare(
    "SELECT client_slug, industry FROM client_settings WHERE industry IS NOT NULL AND industry != ''"
  ).all<{ client_slug: string; industry: string }>()).results;

  const out: ClientStat[] = [];
  for (const s of settings) {
    const scan = await env.DB.prepare(
      `SELECT sr.aeo_score, sr.schema_coverage FROM scan_results sr
         JOIN domains d ON d.id = sr.domain_id
         WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.error IS NULL
         ORDER BY sr.scanned_at DESC LIMIT 1`
    ).bind(s.client_slug).first<{ aeo_score: number; schema_coverage: string }>();

    let schemaPct: number | null = null;
    if (scan?.schema_coverage) {
      try {
        const cov = JSON.parse(scan.schema_coverage) as { type: string; present: boolean }[];
        if (cov.length > 0) {
          const present = cov.filter(c => c.present).length;
          schemaPct = (present / cov.length) * 100;
        }
      } catch { /* ignore */ }
    }

    const snap = await env.DB.prepare(
      `SELECT citation_share FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`
    ).bind(s.client_slug).first<{ citation_share: number }>();

    out.push({
      client_slug: s.client_slug,
      industry: s.industry,
      aeo_score: scan?.aeo_score ?? null,
      citation_share: snap?.citation_share ?? null,
      schema_coverage_pct: schemaPct,
    });
  }
  return out;
}

/** Linear-interpolation percentile on a pre-sorted ascending array. */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

export interface BenchmarkSnapshot {
  industry: string;
  sample_size: number;
  aeo_p25: number; aeo_median: number; aeo_p75: number; aeo_p90: number;
  citation_p25: number | null; citation_median: number | null;
  citation_p75: number | null; citation_p90: number | null;
  schema_coverage_mean: number | null;
  computed_at: number;
}

/** Fetch a single industry's benchmark, or null if it doesn't meet
 *  the sample-size threshold (the row simply won't exist). */
export async function getBenchmark(industry: string, env: Env): Promise<BenchmarkSnapshot | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM industry_benchmarks WHERE industry = ?"
  ).bind(industry).first<BenchmarkSnapshot>();
  return row ?? null;
}

/** Compute the client's percentile within their industry given a value
 *  and the benchmark snapshot. Linear interpolation across the four
 *  known quartile points. Returns 0-100. */
export function percentileFor(value: number, snap: { aeo_p25: number; aeo_median: number; aeo_p75: number; aeo_p90: number }): number {
  // Build a piecewise-linear mapping using p25/p50/p75/p90 + a
  // clamped p100 of max(value, p90 + 10) to avoid jumping past 100.
  const points: { v: number; p: number }[] = [
    { v: snap.aeo_p25, p: 25 },
    { v: snap.aeo_median, p: 50 },
    { v: snap.aeo_p75, p: 75 },
    { v: snap.aeo_p90, p: 90 },
  ];
  if (value <= points[0].v) return Math.round(25 * (value / Math.max(points[0].v, 1)));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (value <= b.v) {
      if (b.v === a.v) return b.p;
      const ratio = (value - a.v) / (b.v - a.v);
      return Math.round(a.p + ratio * (b.p - a.p));
    }
  }
  // Above p90: extrapolate gently up to 99.
  const head = points[points.length - 1];
  const headroom = Math.max(head.v + 10, 100);
  const ratio = Math.min(1, (value - head.v) / (headroom - head.v));
  return Math.round(90 + ratio * 9);
}

/** Same idea for citation share -- separate function because the
 *  null guards are different (citation snap fields can be null). */
export function citationPercentileFor(value: number, snap: BenchmarkSnapshot): number | null {
  if (snap.citation_p25 === null || snap.citation_median === null
      || snap.citation_p75 === null || snap.citation_p90 === null) return null;
  return percentileFor(value, {
    aeo_p25: snap.citation_p25,
    aeo_median: snap.citation_median,
    aeo_p75: snap.citation_p75,
    aeo_p90: snap.citation_p90,
  });
}

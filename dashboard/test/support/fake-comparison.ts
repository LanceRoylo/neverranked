/* Answers compare-loader's queries for the hand-rolled fake D1s in
 * report-facts.test.ts, from the same run rows those fakes already hold.
 *
 * Since 2026-11-03 the readout's question movement and its "from" dots stand
 * on the memo's stable-core comparison, so a fake that cannot answer the
 * loader's two queries builds no comparison and draws no movement at all.
 *
 * The fakes ignore bound parameters, so the per-surface counts are taken over
 * every run in the two windows rather than over the core alone. That is exact
 * for any fixture whose questions are all measured on every measured day, and
 * every fixture that uses this helper is built that way. */

export interface FakeRun {
  engine: string;
  client_cited: number;
  run_at: number;
  keyword: string;
  keyword_id?: number;
}

/** Give each distinct keyword a stable numeric id, as citation_keywords would. */
export function withKeywordIds<T extends FakeRun>(runs: T[]): Array<T & { keyword_id: number }> {
  const ids = new Map<string, number>();
  return runs.map((r) => {
    if (!ids.has(r.keyword)) ids.set(r.keyword, ids.size + 1);
    return { ...r, keyword_id: r.keyword_id ?? ids.get(r.keyword)! };
  });
}

/** The loader's result for this SQL, or null when the SQL is not one of its queries. */
export function comparisonResults(sql: string, runs: FakeRun[], monthKey: string): { results: unknown[] } | null {
  const [y, m] = monthKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1) / 1000;
  const end = Date.UTC(y, m, 1) / 1000;
  const priorStart = Date.UTC(y, m - 2, 1) / 1000;
  const inWindows = withKeywordIds(runs).filter((r) => r.run_at >= priorStart && r.run_at < end);
  if (/FROM instrument_events/.test(sql)) return { results: [] };
  if (/AS day/.test(sql)) {
    const seen = new Map<string, { keyword_id: number; day: string }>();
    for (const r of inWindows) {
      const day = new Date(r.run_at * 1000).toISOString().slice(0, 10);
      seen.set(`${r.keyword_id}|${day}`, { keyword_id: r.keyword_id, day });
    }
    return { results: [...seen.values()] };
  }
  if (/json_each/.test(sql)) {
    const by = new Map<string, { engine: string; prev_runs: number; prev_hits: number; cur_runs: number; cur_hits: number }>();
    for (const r of inWindows) {
      const row = by.get(r.engine) ?? { engine: r.engine, prev_runs: 0, prev_hits: 0, cur_runs: 0, cur_hits: 0 };
      if (r.run_at < start) { row.prev_runs++; row.prev_hits += r.client_cited === 1 ? 1 : 0; }
      else { row.cur_runs++; row.cur_hits += r.client_cited === 1 ? 1 : 0; }
      by.set(r.engine, row);
    }
    return { results: [...by.values()].sort((a, b) => a.engine.localeCompare(b.engine)) };
  }
  return null;
}

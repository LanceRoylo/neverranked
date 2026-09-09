/**
 * keyword-run-verdict.ts — did a per-keyword citation run actually measure?
 *
 * WHY THIS EXISTS. runOneKeywordCitations returned `ok: true` literally,
 * on every path. A keyword whose seven engines all failed was
 * indistinguishable from one that measured cleanly, and its caller
 * discarded the value anyway. Worse, Promise.allSettled catches every
 * engine rejection inside that function, so it never throws, so the
 * step.do wrapping it always succeeded and its automatic retry could
 * never fire. A keyword that wrote nothing completed cleanly and was
 * never attempted again.
 *
 * Extracted rather than inlined because the threshold below is a real
 * judgement call and deserves a test, and because the function it came
 * from needs seven API keys and a database to run at all.
 */

export interface KeywordRunVerdict {
  ok: boolean;
  error?: string;
}

/**
 * ZERO ROWS is the only failure. Partial coverage is ordinary: one engine
 * out of credit while six answer is a normal reading, and calling that a
 * failure would retry calls that cannot succeed and burn budget doing it.
 *
 * Zero rows across every engine is systemic (keys, D1, the keyword row
 * itself), which is the case a retry can actually fix. It is also the case
 * where retrying is safe, because nothing was written and so there is
 * nothing to duplicate.
 */
export function keywordRunVerdict(
  rowsInserted: number,
  rejected: string[],
  engineCount: number,
): KeywordRunVerdict {
  if (rowsInserted > 0) return { ok: true };
  return {
    ok: false,
    error:
      `no rows written across ${engineCount} engines` +
      (rejected.length
        ? ` (rejected: ${rejected.join(", ")})`
        : " (all engines skipped or returned no measurement)"),
  };
}

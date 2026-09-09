/**
 * cohort-rank.ts — one way to compute where a customer places in their cohort.
 *
 * WHY THIS EXISTS. Three code paths ranked the customer and only one did it
 * correctly. memo-inputs' snapshot path was fixed; memo-inputs' legacy path
 * and atlas-context's loadCohort still ran the original:
 *
 *     const all = [...competitorCounts, mine].sort((a, b) => b - a);
 *     const rank = all.indexOf(mine) + 1;
 *
 * indexOf returns the FIRST match in the sorted array, so every tie promoted
 * the customer to the top of the tied group. Tie four venues on 43 citations
 * and the customer is reported 1st of those four off a coincidental equal
 * count. Rank is the most quotable number in the whole readout, and it is the
 * one a customer repeats to their boss.
 *
 * The correct question is how many are STRICTLY ahead. Ties then share the
 * same rank rather than being ordered by array position, which is what
 * "ranked equal" means everywhere outside a sorted-array index.
 */

/**
 * 1-indexed rank: one plus the number of cohort members strictly ahead.
 *
 * Returns null for an empty cohort. A rank of 1 out of nothing is not a
 * standing, and reporting it as one would be the same false confidence the
 * tie bug produced.
 */
export function cohortRank(ownedCount: number, competitorCounts: number[]): number | null {
  if (competitorCounts.length === 0) return null;
  return competitorCounts.filter((c) => c > ownedCount).length + 1;
}

/**
 * Which computation produced a rank. Carried into the Atlas context so the
 * chat model never presents a fallback rank as the published venue rank.
 *
 * "venue_citations" is the number the readout and the monthly memo show:
 * attributed Layer 1 citations, month to date.
 *
 * "entity_mentions_90d" is the fallback for a customer with no readout-shape
 * snapshot yet. Different numerator (entities named in a response, not URLs
 * attributed to a property), different window, different matcher. It is a
 * reasonable answer when there is nothing better and a WRONG one to quote
 * beside the readout.
 */
export type CohortRankBasis = "venue_citations" | "entity_mentions_90d";

export const COHORT_BASIS_NOTE: Record<CohortRankBasis, string> = {
  venue_citations:
    "Rank is by attributed Layer 1 citations for the current month, the same basis as the published readout and the monthly memo, so these agree by construction.",
  entity_mentions_90d:
    "FALLBACK BASIS. No readout-shape snapshot exists for this customer yet, so rank is by how often cohort venues were NAMED in responses over the last 90 days. This is a different measurement from the published readout (which counts cited URLs attributed to a property, month to date). Do not quote this number as the customer's published rank, and say it is provisional if asked.",
};

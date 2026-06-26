/**
 * snapshot-shape.ts — tell the canonical "readout shape" citation_snapshots
 * row apart from the legacy auto-writer shape.
 *
 * Two incompatible shapes coexist in citation_snapshots (see the
 * dashboard_snapshot_shape_split_brain note):
 *
 *   Readout shape (forensic->D1 bridge, what every reader understands):
 *     engines_breakdown : { "Perplexity": {citations,total,share_pct}, ... }   keyed by DISPLAY name
 *     top_competitors   : { htc_venue_share_pct, htc_engines_count, competitors:[{domain,label,venue_share_pct,...}] }
 *
 *   Legacy shape (buildClientSnapshot weekly auto-writer):
 *     engines_breakdown : { "google_ai_overview": {queries,citations}, ... }   keyed by engine ID, no share_pct
 *     top_competitors   : [ {name,count}, ... ]
 *
 * The cockpit, monthly memo, and Atlas all read the readout shape. This guard
 * lets the reader refuse a legacy row (render 404 instead of zeros) and lets
 * the legacy weekly writer skip a forensic-managed customer (no clobber).
 */
export function isReadoutShapeSnapshot(
  enginesBreakdownJson: string | null | undefined,
  topCompetitorsJson?: string | null,
): boolean {
  // Primary signal: at least one engine entry carries a numeric share_pct.
  // (Legacy entries are {queries,citations} with no share_pct.)
  try {
    const eb = JSON.parse(enginesBreakdownJson || "{}");
    if (eb && typeof eb === "object" && !Array.isArray(eb)) {
      const hasShare = Object.values(eb).some(
        (v) => v && typeof v === "object" && typeof (v as { share_pct?: unknown }).share_pct === "number",
      );
      if (hasShare) return true;
    }
  } catch { /* malformed -> not readout shape */ }

  // Secondary signal: top_competitors is an OBJECT with the venue rollup
  // (legacy is a plain [{name,count}] array).
  if (topCompetitorsJson != null) {
    try {
      const tc = JSON.parse(topCompetitorsJson || "{}");
      if (
        tc && typeof tc === "object" && !Array.isArray(tc) &&
        (typeof (tc as { htc_venue_share_pct?: unknown }).htc_venue_share_pct === "number" ||
          Array.isArray((tc as { competitors?: unknown }).competitors))
      ) {
        return true;
      }
    } catch { /* malformed -> not readout shape */ }
  }

  return false;
}

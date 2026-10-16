/**
 * link-basis.ts — what an own-site LINK share is a share of, and when two of
 * them may be compared.
 *
 * DECIDED 2026-10-05 (decision D). Google AI Overviews lists many links on
 * google.com that are not pages anyone wrote: knowledge-panel viewers
 * (/searchviewer), opaque redirects (/goto) and search-result pages. a4cdba7
 * left them out of the source mix and the host list, but each engine's link
 * TOTAL, the denominator of its own-site link share, still counted them. In
 * real client data they were a large share of AI Overviews' links. From
 * this change the per-engine totals leave them out too, every snapshot records
 * LINK_BASIS, and the excluded count per engine is kept so it can be
 * disclosed.
 *
 * LIKE FOR LIKE. A share computed with the wrappers in its denominator and one
 * computed without them are not the same quantity, so no month-over-month
 * movement in a link share may be stated across the change. A prior figure
 * from before it is withheld, with the reason, for every engine the change
 * could have touched. "Could not have touched" is proved, not assumed: zero
 * wrappers left out this month AND zero runs last month listing any link on a
 * bare Google host, the only place a wrapper can live.
 *
 * Run-level figures (client_cited, the comparison layer, like-for-like, the
 * per-question shares) are untouched: a wrapper is never the client's domain.
 * So is the pooled citation_share scalar, which still counts every listed
 * link; see the note at its computation in buildReadoutSnapshot.
 */

import type { Env } from "../types";
import { READOUT_ENGINE_LABEL } from "./readout-engine-labels";

/** Recorded on every snapshot (top_competitors.link_basis) and every set of
 *  readout facts (linkBasis) computed with Google's viewer links left out of
 *  the per-engine link totals. */
export const LINK_BASIS = "google_viewer_links_excluded";
/** What a row with no recorded basis was computed on: every listed link. */
export const LEGACY_LINK_BASIS = "all_listed_links";

export function linkBasisOf(recorded: unknown): string {
  return typeof recorded === "string" && recorded ? recorded : LEGACY_LINK_BASIS;
}

/** The one plain sentence a readout or memo states, once, about the engines
 *  whose link counts left out Google's viewer links this period. Null when
 *  none did, so nothing is said. */
export function linkBasisNote(excludedByEngine: Record<string, number> | null | undefined): string | null {
  const names = Object.entries(excludedByEngine ?? {})
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([name]) => name)
    .sort();
  if (!names.length) return null;
  // "Google AI Overviews' link count", not "Overviews's".
  if (names.length === 1) return `${names[0]}${/s$/i.test(names[0]) ? "'" : "'s"} link count leaves out Google's own viewer links.`;
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `The link counts for ${list} leave out Google's own viewer links.`;
}

/** Why a link-share movement is not stated, in words a reader can be shown. */
export const LINK_MOVEMENT_WITHHELD =
  "Not compared with last month: we changed how this tool's links are counted, " +
  "and Google's own viewer links are now left out. Last month's figure was counted the old way.";

/**
 * Withhold this engine's link-share movement? Null means it may be stated.
 *
 * Same basis: never withheld. Different basis: withheld when this period left
 * any wrapper out, or the prior period has any run that listed a link on a
 * bare Google host, or that evidence could not be read (null). Fails closed.
 */
export function linkMovementWithheld(a: {
  curBasis: string;
  priorBasis: string;
  curExcluded: number;
  priorEvidence: number | null;
}): string | null {
  if (a.curBasis === a.priorBasis) return null;
  if (a.curExcluded > 0 || a.priorEvidence === null || a.priorEvidence > 0) return LINK_MOVEMENT_WITHHELD;
  return null;
}

/**
 * Per engine (display label), how many runs in [start, end) listed a link on
 * a bare Google host. A superset of runs with a wrapper link: classifyGoogleLink
 * only ever calls a link a wrapper when its host is google.<tld> or
 * www.google.<tld>, and LIKE is case-insensitive. Zero proves the period had
 * no wrapper in any link total. Null when the evidence could not be read,
 * which the caller treats as "may have".
 *
 * COUNT only, nothing transferred. It scans the cited_urls of one client's
 * month, the same rows a snapshot build reads.
 */
export async function priorGoogleLinkEvidence(
  env: Env,
  slug: string,
  start: number,
  end: number,
): Promise<Map<string, number> | null> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT cr.engine AS engine, COUNT(*) AS n
         FROM citation_runs cr JOIN citation_keywords ck ON ck.id = cr.keyword_id
        WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
          AND (cr.cited_urls LIKE '%://google.%' OR cr.cited_urls LIKE '%://www.google.%')
        GROUP BY cr.engine`,
    ).bind(slug, start, end).all<{ engine: string; n: number }>()).results;
    const out = new Map<string, number>();
    for (const r of rows) out.set(READOUT_ENGINE_LABEL[r.engine] ?? r.engine, Number(r.n) || 0);
    return out;
  } catch (e) {
    console.log(`[link-basis] ${slug}: prior Google-link evidence unreadable, withholding link-share movement: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

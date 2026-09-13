/**
 * retired-claims.ts — nothing with a retracted or retired claim leaves this
 * worker on a public surface.
 *
 * WHY THIS EXISTS. On 2026-09-12 a weekly brief had been sitting in the admin
 * inbox for 71 days, status draft, one POST to /admin/weekly-brief/1/approve
 * away from a public page. Its summary said "923 queries across seven AI
 * engines" and its body named Copilot. `publishBrief()` was a bare UPDATE with
 * no check of any kind.
 *
 * The site has a gate for this (scripts/check-claims.mjs, blocking in the
 * build) and the marketing repo has one (canon/claims-patterns.js, blocking at
 * render). The dashboard, which is the only one of the three that can publish
 * to a public URL with a single click, had none.
 *
 * ON DUPLICATING THE PATTERNS. This codebase's recurring defect is one fact
 * written down twice and drifting apart, so a third copy deserves an argument.
 * The argument is that this list is CLOSED and only grows. Every entry is a
 * permanent retraction: the claims below can never become true again, so an
 * old entry cannot go stale. The only drift risk is a NEW retirement not being
 * added here, which is why retire-claim.mjs walks every surface and why this
 * file is named so that sweep finds it.
 *
 * Canonical sources, in order of authority:
 *   ~/Projects/neverranked/scripts/check-claims.mjs        (the site build gate)
 *   ~/Projects/neverranked-marketing/canon/claims-patterns.js  (the render gate)
 *   hello-momentum-agency/brand-guidelines/NEVERRANKED_BRAND.md (the Fact Bank)
 */

export interface RetiredClaim {
  id: string;
  /** What a human needs to know to fix it. */
  why: string;
  re: RegExp;
}

export const RETIRED_CLAIMS: ReadonlyArray<RetiredClaim> = [
  {
    id: "retired-seven-tools",
    why:
      'claims seven AI tools. Retired 2026-08-22: six AI tools (four citation-grade that search the live web, two model-knowledge), plus Bing organic as a classic-search control. "seven measured surfaces" is correct and is deliberately not matched here.',
    // "surfaces" is absent on purpose: seven channels genuinely WERE queried,
    // and saying so is true. What is false is calling all seven AI tools.
    re: /\b(?:seven|7)\s+AI\s+(?:tools?|engines?)\b|\b(?:seven|7)\s+(?:tools?|engines?)\b/i,
  },
  {
    id: "retired-copilot",
    why:
      "attributes measured behaviour to Copilot. Retired 2026-08-22: that channel is Bing organic top-5 via a search-data provider, published as \"Bing search (control)\". There is no Copilot data and there never was.",
    re: /\bCopilot\b/i,
  },
  {
    id: "retracted-htc-score",
    why:
      "the 45-to-95 score lift is publicly retracted (neverranked.com/retraction/, 2026-05-21) and must never be republished in any framing.",
    re: /\b45\s*(?:to|-|–|→)\s*95\b|\bscore\s+went\s+from\s+45\b/i,
  },
  {
    id: "retracted-htc-perplexity",
    why:
      "the 14-of-19 Perplexity citation claim is publicly retracted (neverranked.com/retraction/, 2026-05-21), including the \"5 to 14\" framing.",
    re: /\b14\s*(?:of|\/)\s*19\b|\b5\s*(?:to|-|–|→)\s*14\b/i,
  },
];

/** The first retired claim in `text`, or null. Returns the MATCHED TEXT too,
 *  because a refusal a human cannot locate in the document is not actionable. */
export function firstRetiredClaim(
  text: string | null | undefined,
): { id: string; why: string; match: string } | null {
  if (typeof text !== "string" || !text) return null;
  for (const c of RETIRED_CLAIMS) {
    const m = c.re.exec(text);
    if (m) return { id: c.id, why: c.why, match: m[0] };
  }
  return null;
}

/** Convenience for call sites that check several fields of one document.
 *  Reports WHICH field failed, since "somewhere in this brief" is not a fix. */
export function firstRetiredClaimIn(
  fields: Record<string, string | null | undefined>,
): { field: string; id: string; why: string; match: string } | null {
  for (const [field, value] of Object.entries(fields)) {
    const hit = firstRetiredClaim(value);
    if (hit) return { field, ...hit };
  }
  return null;
}

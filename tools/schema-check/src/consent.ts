/**
 * The consent lines the check page has shown, keyed by version.
 *
 * The lead row stores the version AND the exact words, looked up here on the
 * server. The browser only names a version, it never supplies the text, so a
 * capture can never be recorded with words the visitor did not see.
 *
 * Adding a version: add a row here, point CURRENT_CONSENT_VERSION at it, and
 * change the page's consent line to the same text (copy.ts reads it from
 * here, so there is only one copy). Never edit the text of a version that has
 * shipped. Leads already captured under it point at those words.
 */

export interface ConsentVersion {
  text: string;
  /** May Lance follow up on this capture (the outreach handoff reads this). */
  followup_ok: 0 | 1;
}

export const CONSENT_VERSIONS: Record<string, ConsentVersion> = {
  // The fine print every capture before October 2026 was shown. Its follow-ups
  // were the automated day-3 and day-7 drip, already sent, so these leads are
  // never followed up again.
  "legacy-2026-05": {
    text: "Your report now, plus two short follow-ups over the next week. Nothing after that.",
    followup_ok: 0,
  },
  // Approved 2026-10-07 (free-check fix plan, Appendix A, decision 7a).
  "gate-2026-10a": {
    text: "We email your result now. Lance may follow up once or twice about it, and every email has an unsubscribe link. We never sell or share your email.",
    followup_ok: 1,
  },
};

export const CURRENT_CONSENT_VERSION = "gate-2026-10a";

/**
 * The consent a capture was given. A request that names no known version was
 * sent by a page that predates versioning (a cached copy of the old page), and
 * that page showed the legacy fine print, so that is what it gets.
 */
export function consentFor(version: unknown): { version: string } & ConsentVersion {
  const v = typeof version === "string" && CONSENT_VERSIONS[version] ? version : "legacy-2026-05";
  return { version: v, ...CONSENT_VERSIONS[v] };
}

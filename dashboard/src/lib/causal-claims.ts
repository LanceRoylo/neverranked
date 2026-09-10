/**
 * causal-claims.ts — one copy of "this sentence claims causation".
 *
 * NeverRanked's whole position is that it measures and never claims its work
 * moved the number. The published Atlas boundary says it refuses "causation
 * claims of any kind", and atlas-grader.ts enforced that with a regex set.
 * The monthly readout notes, which are the higher-stakes surface because they
 * are the deliverable a customer opens, had only a line of prompt instruction.
 *
 * report-notes.ts already learned this lesson twice and wrote it down:
 * "instructing a model not to invent figures was not enough". The same is
 * true of instructing it not to claim causation.
 *
 * A second private copy of a rule is the obvious next bug, so the patterns
 * live here and both graders import them.
 *
 * SCOPE. Correlation stated plainly is allowed and is not matched here.
 * "On the same day you published the page, Perplexity began citing you" is a
 * legitimate observation. "Publishing the page got you cited" is not.
 */

/** Sentences that assert one thing produced another. */
export const CAUSAL_PATTERNS: RegExp[] = [
  /\bcaused\b/i,
  /\bcause[ds]?\s+(?:your|the|a|an|it)\b/i,
  /\bdrove\b/i,
  /\bdriving\b/i,
  /\bled to\b/i,
  /\bleading to\b/i,
  /\bresulted in\b/i,
  /\bresulting in\b/i,
  /\bbecause of\b/i,
  /\bdue to\b/i,
  /\bas a result of\b/i,
  /\bthanks to\b/i,
];

/** The first causal phrase in `text`, or null when it makes no causal claim. */
export function firstCausalClaim(text: string): string | null {
  if (!text) return null;
  for (const re of CAUSAL_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/** True when the note makes no causal claim. Rejecting is always safe: the
 *  chart falls back to mechanics-only, exactly as it behaved before analyst
 *  notes existed. */
export function noteCausalOk(note: string): boolean {
  return firstCausalClaim(note) === null;
}

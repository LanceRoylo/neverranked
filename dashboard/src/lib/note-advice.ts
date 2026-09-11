/**
 * note-advice.ts — the readout describes. It does not rank impact.
 *
 * THE PUBLISHED BOUNDARY, from the homepage's Atlas section:
 *
 *   "What Atlas refuses: What you should do about it / Which fix to
 *    prioritize first / Whether a tactic is a good idea / Causation claims
 *    of any kind / Strategic positioning advice.
 *    The boundary is structural. Prioritization lives in your monthly memo,
 *    WRITTEN BY THE PRINCIPAL. Atlas holds the data."
 *
 * So prioritization is allowed in the memo. That is the design. The promise
 * is that a human writes it. These notes are written by a model, and on
 * 2026-09-11 a preview of the September readout produced:
 *
 *   "Keeping your listings accurate and current on these named platforms
 *    matters more right now than any other single lever."
 *   "The opportunity is less about publishing more on your own site and
 *    more about making sure the independent content is accurate."
 *
 * The first is a claim about relative causal impact, which the measurement
 * cannot establish and which is exactly the "validated incremental lift"
 * implication the practice exists to avoid. The second is strategic advice.
 * Both passed every existing guard: the numbers were real, the engine verbs
 * were right, the layers were kept apart.
 *
 * NOT A PORT OF THE ATLAS GUARD. atlas-grader.ts refuses prioritization
 * outright because Atlas is the data surface. The memo is allowed to
 * prioritize, so a blanket ban here would be wrong and would gut notes that
 * are doing their job. This blocks two narrower things:
 *
 *   RANKED IMPACT       "matters more than any other lever", "the biggest
 *                       lever", "your top priority". A causal ordering.
 *   STRATEGIC ADVICE    "the opportunity is", "focus on", "you should",
 *                       "less about X and more about Y". A recommendation.
 *
 * WHAT STAYS LEGAL, deliberately. The notes prompt asks every note to end
 * forward-looking, so "watch whether you close that gap next month" and
 * "next month will show whether these levels hold" must pass. They are
 * observations about what the next reading will reveal, not instructions.
 * Verified against nine real sentences from the September preview, including
 * every line of the engines note, which is the methodology working correctly
 * and must not be collateral damage.
 */

/** Claims that one action outranks another in impact. */
const RANKED_IMPACT: RegExp[] = [
  /\bmatters? (?:more|most)\b/i,
  /\bmore than any other\b/i,
  /\b(?:the )?(?:single )?(?:biggest|largest|most important|highest[- ]impact) (?:lever|factor|thing|opportunity|priority|driver)\b/i,
  /\bbefore anything else\b/i,
  /\byour (?:top|first) priority\b/i,
  /\bthe priority (?:here )?is\b/i,
];

/** Recommendations about what to do, as opposed to what was observed. */
const STRATEGIC_ADVICE: RegExp[] = [
  /\bthe opportunity is\b/i,
  /\bless about\b[^.\n]{0,60}\bmore about\b/i,
  /\bfocus (?:on|less on)\b/i,
  /\bwhat you (?:should|need to|want to) do\b/i,
  /\byou should\b/i,
  /\byou need to\b/i,
  /\bmake sure (?:you|your)\b/i,
  /\bworth (?:doing|prioritis|prioritiz)/i,
  // Added after the first live preview: with "the priority is" blocked, the
  // model reached for "should be the first checkpoint" instead. That is the
  // limit of a pattern guard on advice, which has no finite vocabulary the
  // way numbers or engine verbs do. The prompt is the primary control here
  // and this list is the backstop, not the other way round.
  /\bshould be (?:the |your )?(?:first|next|top|main)\b/i,
  /\bstart (?:with|by)\b/i,
  /\bthe (?:first|next) (?:checkpoint|step|thing) (?:is|should)\b/i,
];

export const ADVICE_PATTERNS: RegExp[] = [...RANKED_IMPACT, ...STRATEGIC_ADVICE];

/** The first advice phrase in `note`, or null when it only describes. */
export function firstAdviceClaim(note: string): string | null {
  if (!note) return null;
  for (const re of ADVICE_PATTERNS) {
    const m = re.exec(note);
    if (m) return m[0];
  }
  return null;
}

/** True when the note describes without ranking impact or recommending.
 *  Rejecting is safe: the chart renders mechanics-only, which is how it
 *  behaved before analyst notes existed. */
export function noteAdviceOk(note: string): boolean {
  return firstAdviceClaim(note) === null;
}

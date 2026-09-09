/**
 * engine-verb-claims.ts — the published methodology's absolute, enforced.
 *
 * neverranked.com/methodology states, in the scope section:
 *
 *   "We do not say an engine 'recommends,' 'prefers,' 'endorses,' or 'ranks'
 *    a business."
 *
 * That is a promise about every word we ship, and until now only one of the
 * four verbs was blocked, only inside the Bing-control check in
 * report-notes.ts. The monthly memo, which is longer, model-written and
 * prescriptive by design, had no such guard at all.
 *
 * WHY IT MATTERS. The claim is not stylistic. An engine returns sources; it
 * does not endorse. Saying Perplexity "recommends" a business asserts intent
 * the instrument cannot see, and it is precisely the overreach a customer's
 * own auditor would catch first. It is also the kind of sentence a model
 * writes naturally when asked to sound useful.
 *
 * WHY PROXIMITY, NOT A WORD BAN. The memo deliberately RANKS things: its
 * punch list is ordered, and the prompt says so. "Ranked by impact" is our
 * prioritisation and is fine. The rule is about attributing the verb to an
 * ENGINE, so the check only fires when a forbidden verb sits next to an
 * engine's name.
 */

const FORBIDDEN = /\b(recommend(?:s|ed|ing)?|prefer(?:s|red|ring)?|endors(?:e|es|ed|ing)|rank(?:s|ed|ing)?)\b/i;

/** Chars scanned on each side of an engine mention. Wide enough for
 *  "Perplexity now clearly prefers", narrow enough that an unrelated later
 *  clause about our own priority order does not get swept in. */
const WINDOW = 60;

export interface EngineVerbHit {
  engine: string;
  verb: string;
  quote: string;
}

/**
 * Find places where a forbidden verb is attributed to a named engine.
 *
 * Scans BOTH sides of the engine name: "Gemini prefers them" and
 * "recommended by Gemini" are the same claim in different grammar, and only
 * checking forward would have let the passive form through.
 */
export function engineVerbClaims(text: string, engineNames: string[]): EngineVerbHit[] {
  const hits: EngineVerbHit[] = [];
  if (!text) return hits;
  const lower = text.toLowerCase();

  for (const name of engineNames) {
    const needle = name.toLowerCase();
    if (needle.length < 3) continue;
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i === -1) break;
      from = i + needle.length;
      const start = Math.max(0, i - WINDOW);
      const end = Math.min(text.length, i + needle.length + WINDOW);
      // Exclude the engine's own name from the scan so a tool that happens to
      // contain one of these words cannot flag itself.
      const before = text.slice(start, i);
      const after = text.slice(i + needle.length, end);
      for (const side of [before, after]) {
        const m = side.match(FORBIDDEN);
        if (m) {
          hits.push({ engine: name, verb: m[0], quote: text.slice(start, end).trim() });
          break;
        }
      }
    }
  }
  return hits;
}

/** True when the prose makes no forbidden attribution. */
export function engineVerbClaimsOk(text: string, engineNames: string[]): boolean {
  return engineVerbClaims(text, engineNames).length === 0;
}

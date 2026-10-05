/**
 * The ONE map between engine keys (citation_runs.engine) and the labels the
 * readout snapshot writes into engines_breakdown.
 *
 * It lived privately in citations.ts. The memo needs to join snapshot rows back
 * to run counts, and four incompatible spellings of the same engine already
 * shipped a client a report one engine short. A second copy of this map is how
 * that happens again, so there is exactly one, imported by both.
 */
export const READOUT_ENGINE_LABEL: Record<string, string> = {
  perplexity: "Perplexity",
  openai: "ChatGPT search",
  gemini: "Gemini grounded",
  google_ai_overview: "Google AI Overviews",
  bing: "Bing search (control)",
  anthropic: "Claude",
  gemma: "Gemma",
};

const KEY_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(READOUT_ENGINE_LABEL).map(([k, v]) => [v, k]),
);

/** The engine key for a snapshot label, or null when the label is unknown. */
export function engineKeyForLabel(label: string): string | null {
  return KEY_BY_LABEL[label] ?? null;
}

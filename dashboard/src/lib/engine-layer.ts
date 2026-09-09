/**
 * engine-layer.ts — the one place that knows which layer a surface measures.
 *
 * THE TWO LAYERS. Layer 1 surfaces retrieve and cite, so their share is a
 * share of CITED SOURCES. Layer 2 surfaces answer from model knowledge, so
 * their share is a share of ANSWERS THAT NAME the business. Different
 * numerators, different denominators, not comparable in either direction.
 * Ranking them in one list is itself the claim that they are.
 *
 * WHY A SHARED MODULE. citations.ts held this privately, and Atlas never had
 * it at all: atlas-context.ts parsed engines_breakdown into
 * `{ citations, total, share_pct }` and dropped the layer field the snapshot
 * writes, then sorted all seven surfaces into one descending list. A
 * model-knowledge surface therefore sorted above every citation-grade one, in
 * the customer-facing chat, where there is no prose guard to catch it.
 *
 * A second private copy of this knowledge was the obvious next bug, so there
 * is one copy and both callers import it.
 *
 * BOTH KEY STYLES ON PURPOSE. The snapshot path keys engines by DISPLAY LABEL
 * ("ChatGPT search") and the runs-based fallback keys them by RAW ENGINE
 * ("openai"). Atlas uses whichever path produced data, so a resolver that
 * understood only one style would silently return "unknown" for the other.
 */

/** Raw engine keys, as stored in citation_runs.engine. */
export const LAYER1_ENGINE_KEYS: ReadonlySet<string> = new Set([
  "perplexity",
  "openai",
  "gemini",
  "google_ai_overview",
  "bing",
]);

/** Display labels, as written into citation_snapshots.engines_breakdown. */
export const LAYER1_ENGINE_LABELS: ReadonlySet<string> = new Set([
  "Perplexity",
  "ChatGPT search",
  "Gemini grounded",
  "Google AI Overviews",
  "Bing search (control)",
]);

const LAYER2_ENGINE_KEYS: ReadonlySet<string> = new Set(["anthropic", "gemma"]);
const LAYER2_ENGINE_LABELS: ReadonlySet<string> = new Set(["Claude", "Gemma"]);

export type EngineLayer = "citation" | "model_knowledge" | "unknown";

/**
 * Resolve a surface's layer from either a raw engine key or a display label.
 *
 * Returns "unknown" rather than guessing. An unrecognised name means a label
 * drifted, and asserting the wrong layer is worse than admitting we cannot
 * tell: the whole point of carrying this field is to stop a share of answers
 * being read as a share of citations.
 */
export function engineLayer(engine: string): EngineLayer {
  if (LAYER1_ENGINE_KEYS.has(engine) || LAYER1_ENGINE_LABELS.has(engine)) return "citation";
  if (LAYER2_ENGINE_KEYS.has(engine) || LAYER2_ENGINE_LABELS.has(engine)) return "model_knowledge";
  return "unknown";
}

/**
 * Order for presentation: citation-grade first, then model-knowledge, then
 * unknown, and by share only WITHIN a layer.
 *
 * Sorting all surfaces by share across layers produced a single ranked list,
 * which reads as "your best surface is X" no matter what the field labels
 * say. Grouping first means the ordering can no longer make a claim the
 * measurement does not support.
 */
export function byLayerThenShare<T extends { layer: EngineLayer; share_pct: number }>(a: T, b: T): number {
  const rank = (l: EngineLayer) => (l === "citation" ? 0 : l === "model_knowledge" ? 1 : 2);
  return rank(a.layer) - rank(b.layer) || b.share_pct - a.share_pct;
}

/** Shown to the chat model beside the figures. It reads this. */
export const LAYER_UNITS_NOTE =
  "Each surface carries a layer, and the two are different measurements that must never be compared, ranked against each other, or summed. " +
  "layer 'citation' means the surface retrieves and cites: share_pct is the share of CITED SOURCES that were this customer. " +
  "layer 'model_knowledge' means the surface answers from what the model already knows: share_pct is the share of ANSWERS THAT NAMED the customer, and that surface cites nothing at all. " +
  "A model-knowledge share is almost always the larger number because its denominator is smaller, so calling it the customer's 'best' or 'strongest' surface is false. " +
  "layer 'unknown' means the surface name was not recognised: report its figure only with that caveat. " +
  "Bing search (control) is a classic-search control, not an AI tool, and never 'answers' or 'cites'.";

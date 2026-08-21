/**
 * engine-order.ts — the one canonical list of measured engines.
 *
 * WHY THIS FILE EXISTS. This list was written out twice, independently, in
 * report-facts.ts (GRID_ENGINE_ORDER) and routes/customer-view.ts
 * (MAP_ENGINE_ORDER). Both claimed to hold "citation_runs.engine raw keys".
 * Both spelled Google AI Overviews `google_aio`. The daily runner inserts
 * `google_ai_overview` (citations.ts, the INSERT is a string literal), so
 * neither list ever matched a single row.
 *
 * The effect was silent in both places, because both filter rather than
 * throw: the readout grid dropped the engine from the chart, and the cockpit
 * citation map dropped the engine node AND every edge attached to it. HTC's
 * delivered August 2026 report carries six engines for this reason.
 *
 * Nothing failed. The chart simply rendered one column short, and no reader
 * of a delivered report can tell a measured-zero from a never-matched.
 *
 * So: one list, imported by every consumer, with a test asserting each key
 * is a key the writer actually inserts. A key that stops matching should
 * break a test, not quietly shrink a customer's chart.
 */

/** Raw citation_runs.engine keys, in canonical display order:
 *  five citation-grade web-searching tools, then the two model-knowledge
 *  tools. Keys MUST equal the literals the daily runner inserts. */
export const ENGINE_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "perplexity", label: "Perplexity" },
  { key: "openai", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "bing", label: "Copilot" },
  { key: "google_ai_overview", label: "Google AIO" },
  { key: "anthropic", label: "Claude" },
  { key: "gemma", label: "Gemma" },
];

/** Convenience set for membership checks. */
export const ENGINE_KEYS: ReadonlySet<string> = new Set(ENGINE_ORDER.map((e) => e.key));

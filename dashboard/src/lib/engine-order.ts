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
// Order: four citation-grade AI engines that search the live web, two
// model-knowledge engines, then the classic-search control LAST.
//
// RECLASSIFIED 2026-08-22: the `bing` channel is Bing organic top-5, which
// is keyword search, not an answer engine -- it returns a pop song for
// "where to stay in Waikiki". Labeling it "Copilot" presented search-index
// noise as AI-answer behavior, and the public correction of 2026-08-22
// (teardowns/agency-us) came out of exactly that. The DATA stays: classic
// search alongside AI answers is the control that shows they are different
// surfaces. Only the label and its position changed. The key stays `bing`
// for series continuity.
export const ENGINE_ORDER: ReadonlyArray<{ key: string; label: string; aliases: readonly string[] }> = [
  { key: "perplexity", label: "Perplexity", aliases: ["Perplexity"] },
  { key: "openai", label: "ChatGPT", aliases: ["ChatGPT search", "ChatGPT"] },
  { key: "gemini", label: "Gemini", aliases: ["Gemini grounded", "Gemini"] },
  { key: "google_ai_overview", label: "Google AIO", aliases: ["Google AI Overviews", "Google AI Overview", "Google AI", "google_aio"] },
  { key: "anthropic", label: "Claude", aliases: ["Claude", "Claude (training data)", "claude"] },
  { key: "gemma", label: "Gemma", aliases: ["Gemma", "Gemma (training data)"] },
  { key: "bing", label: "Bing search (control)", aliases: ["Bing search (control)", "Bing organic (control)", "Bing organic", "Microsoft Copilot (Bing)", "Microsoft Copilot"] },
];

/** Every spelling that resolves, mapped to the raw key the runner inserts.
 *
 *  WHY ALIASES AND NOT ANOTHER LIST. Two writers put engines into
 *  citation_snapshots.engines_breakdown and they do not agree. The dashboard
 *  writes raw keys ("openai"). The forensic bridge writes display labels
 *  ("ChatGPT search"). Verified against production 2026-09-12: 26 snapshots
 *  hold exactly those two conventions, 14 distinct strings. Any consumer that
 *  matches one convention against the other matches NOTHING, and because every
 *  consumer here filters rather than throws, the result is a chart quietly one
 *  column short. That has already shipped once.
 *
 *  RETIRED LABELS ARE ACCEPTED AS INPUT. "Microsoft Copilot (Bing)" still sits
 *  in generator code and may sit in an old export. Reading it is archaeology
 *  and resolves to `bing`. Reading a retired label is not the same act as
 *  emitting one: nothing here ever returns it, because the canonical label
 *  comes from `label`, never from `aliases`. Same for the `google_aio` and
 *  `claude` key spellings, which are wrong against the runner and live in four
 *  generator files in the outreach repo. */
const BY_ALIAS: ReadonlyMap<string, string> = new Map(
  ENGINE_ORDER.flatMap((e) =>
    [e.key, e.label, ...e.aliases].map((s) => [s.trim().toLowerCase(), e.key] as [string, string]),
  ),
);

/** Resolve any known spelling of an engine to the raw citation_runs.engine key.
 *  Returns null for anything unrecognised, which callers MUST treat as "do not
 *  know" rather than as "not present". Silently dropping an unresolved engine
 *  is the defect this file exists to prevent. */
export function resolveEngineKey(spelling: string): string | null {
  if (typeof spelling !== "string") return null;
  return BY_ALIAS.get(spelling.trim().toLowerCase()) ?? null;
}

/** The canonical display label for any known spelling, or null. Never returns
 *  a retired label, whatever was passed in. */
export function canonicalEngineLabel(spelling: string): string | null {
  const key = resolveEngineKey(spelling);
  return key ? (ENGINE_ORDER.find((e) => e.key === key)?.label ?? null) : null;
}

/** Convenience set for membership checks. */
export const ENGINE_KEYS: ReadonlySet<string> = new Set(ENGINE_ORDER.map((e) => e.key));

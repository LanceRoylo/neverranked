/**
 * AEO Analyzer — Shared analysis module
 *
 * Used by both the free health check tool (check.neverranked.com)
 * and the client dashboard (app.neverranked.com).
 */

// Types
export type { Signals, Report, TechnicalSignal } from "./types";

// Extraction
export { stripHtml, countWords, collectSchemaTypes, extractMeta } from "./extract";

// Scoring
export { calculateAeoScore, calculateGrade } from "./score";

// Red flags
export { generateRedFlags } from "./flags";

// Technical signals
export { CRITICAL_SCHEMAS, generateTechnicalSignals } from "./signals";

// Full report builder
export { buildReport } from "./report";

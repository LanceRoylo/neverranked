/**
 * AEO Analyzer -- Shared analysis module
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

// Schema hierarchy
export {
  normalizeType,
  getAncestors,
  isSubtypeOf,
  hasSchemaType,
  getUnknownTypes,
  getKnownTypes,
} from "./hierarchy";

// Full report builder
export { buildReport, buildReportFollowingSnippets } from "./report";

// Schema completeness grader (Phase 6B: shared between dashboard +
// public schema-check Worker)
export { gradeSchema, gradeBucket } from "./schema-grader";
export type { SchemaGrade } from "./schema-grader";

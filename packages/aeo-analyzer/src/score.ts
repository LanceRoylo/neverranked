/**
 * AEO Analyzer -- Scoring and grading
 *
 * Uses hasSchemaType() so subtypes count as matching parent types for
 * scoring purposes (a ProfessionalService page earns the Organization
 * points just like an Organization page does).
 */

import type { Signals } from "./types";
import { hasSchemaType } from "./hierarchy";

export function calculateAeoScore(signals: Signals): number {
  let score = 0;
  if (hasSchemaType(signals.schema_types, "Organization")) score += 20;
  if (hasSchemaType(signals.schema_types, "WebSite")) score += 10;
  if (hasSchemaType(signals.schema_types, "BreadcrumbList")) score += 10;
  if (hasSchemaType(signals.schema_types, "FAQPage")) score += 10;
  if (signals.canonical) score += 10;
  if (signals.og_image) score += 5;
  if (signals.links_external >= 3) score += 15;
  else if (signals.links_external >= 1) score += 5;
  if (signals.word_count >= 300) score += 10;
  if (signals.has_rating_text || signals.has_testimonial_text) score += 10;
  return score;
}

/**
 * Grade bands tightened vs. academic grading (50% is not a C).
 * AEO readiness is closer to binary — you either have the schema or
 * you don't — so a passing grade should mean the site is actually
 * AI-readable, not "almost there".
 *
 *   A  90-100  AI engines have everything they need to cite reliably
 *   B  75-89   strong, minor gaps
 *   C  60-74   meaningful gaps that cost citations
 *   D  40-59   significant work needed
 *   F   0-39   not AI-readable
 */
export function calculateGrade(score: number): string {
  // Delegates to the shared band utility so all three scoring
  // systems (schema-grader, AEO Readiness, NVI) stay aligned on
  // one set of thresholds.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { gradeFor } = require("./grade-bands") as typeof import("./grade-bands");
  return gradeFor(score);
}

/**
 * AEO Analyzer — Scoring and grading
 */

import type { Signals } from "./types";

export function calculateAeoScore(signals: Signals): number {
  let score = 0;
  if (signals.schema_types.includes("Organization")) score += 20;
  if (signals.schema_types.includes("WebSite")) score += 10;
  if (signals.schema_types.includes("BreadcrumbList")) score += 10;
  if (signals.schema_types.includes("FAQPage")) score += 10;
  if (signals.canonical) score += 10;
  if (signals.og_image) score += 5;
  if (signals.links_external >= 3) score += 15;
  else if (signals.links_external >= 1) score += 5;
  if (signals.word_count >= 300) score += 10;
  if (signals.has_rating_text || signals.has_testimonial_text) score += 10;
  return score;
}

export function calculateGrade(signals: Signals, redFlags: string[]): string {
  const hasOrg = signals.schema_types.includes("Organization");
  const hasWebSite = signals.schema_types.includes("WebSite");
  const hasBreadcrumb = signals.schema_types.includes("BreadcrumbList");
  const hasCanonical = !!signals.canonical;
  const hasOgImage = signals.og_image;
  const hasAnySchema = signals.schema_types.length > 0;

  if (hasOrg && hasWebSite && hasBreadcrumb && hasCanonical && hasOgImage && signals.links_external >= 3 && redFlags.length <= 2) {
    return "A";
  }
  if (hasOrg && hasWebSite && hasCanonical && hasOgImage && redFlags.length <= 4) {
    return "B";
  }
  if (hasAnySchema && hasCanonical && redFlags.length <= 6) {
    return "C";
  }
  if (hasAnySchema || (hasCanonical && hasOgImage)) {
    return "D";
  }
  return "F";
}

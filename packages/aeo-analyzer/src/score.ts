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

export function calculateGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

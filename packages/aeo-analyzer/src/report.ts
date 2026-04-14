/**
 * AEO Analyzer — Report builder (composes all modules)
 */

import type { Report } from "./types";
import { extractMeta } from "./extract";
import { generateRedFlags } from "./flags";
import { calculateAeoScore, calculateGrade } from "./score";
import { generateTechnicalSignals, CRITICAL_SCHEMAS } from "./signals";

export function buildReport(url: string, html: string): Report {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  const signals = extractMeta(html, url);
  const redFlags = generateRedFlags(signals);
  const aeoScore = calculateAeoScore(signals);
  const grade = calculateGrade(aeoScore);

  const schemaCoverage = CRITICAL_SCHEMAS.map((type) => ({
    type,
    present: signals.schema_types.some((t) => t === type || (type === "Article" && t === "BlogPosting") || (type === "BlogPosting" && t === "Article")),
  }));

  const technicalSignals = generateTechnicalSignals(signals);

  return {
    url,
    domain,
    signals,
    schema_coverage: schemaCoverage,
    red_flags: redFlags,
    grade,
    aeo_score: aeoScore,
    technical_signals: technicalSignals,
  };
}

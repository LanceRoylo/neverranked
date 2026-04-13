/**
 * AEO Analyzer — Red flag generation
 */

import type { Signals } from "./types";

export function generateRedFlags(signals: Signals): string[] {
  const flags: string[] = [];

  if (!signals.canonical) {
    flags.push("No canonical tag detected — risk of duplicate content in AI indexes");
  }
  if (!signals.og_image) {
    flags.push("No og:image tag — social sharing and AI previews will lack visual context");
  }
  if (!signals.schema_types.includes("Organization")) {
    flags.push("No Organization schema — critical for entity recognition by AI engines");
  }
  if (!signals.schema_types.includes("WebSite")) {
    flags.push("No WebSite schema — SearchAction rich results are disabled");
  }
  if (!signals.schema_types.includes("BreadcrumbList")) {
    flags.push("No BreadcrumbList schema — rich result breadcrumbs are disabled");
  }
  if (!signals.schema_types.some((t) => t === "AggregateRating")) {
    flags.push("No AggregateRating detected — AI engines have no social proof hook to cite");
  }
  if (signals.h1_count === 0) {
    flags.push("No H1 tag found — heading structure is broken");
  }
  if (signals.h1_count > 1) {
    flags.push(`Multiple H1 tags found (${signals.h1_count}) — dilutes heading hierarchy`);
  }
  if (signals.title_len > 0 && signals.title_len < 30) {
    flags.push(`Title tag is only ${signals.title_len} characters — too short for SERP visibility`);
  }
  if (signals.title_len > 65) {
    flags.push(`Title tag is ${signals.title_len} characters — will truncate in search results`);
  }
  if (signals.meta_desc_len > 0 && signals.meta_desc_len < 80) {
    flags.push(`Meta description is only ${signals.meta_desc_len} characters — too thin`);
  }
  if (signals.meta_desc_len > 160) {
    flags.push(`Meta description is ${signals.meta_desc_len} characters — will truncate`);
  }
  if (signals.links_external < 2) {
    flags.push(`Only ${signals.links_external} external links — AEO authority signal is weak`);
  }
  if (signals.word_count < 300) {
    flags.push(`Only ${signals.word_count} words on page — thin content hurts AI citability`);
  }
  if (signals.img_count > 0 && signals.img_no_alt > 0) {
    flags.push(`${signals.img_no_alt} of ${signals.img_count} images are missing alt text`);
  }
  if (signals.jsonld_parse_errors > 0) {
    flags.push(`${signals.jsonld_parse_errors} JSON-LD block(s) have parse errors — schema is broken`);
  }

  return flags;
}

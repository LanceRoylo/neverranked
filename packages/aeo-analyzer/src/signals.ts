/**
 * AEO Analyzer — Technical signal generation and constants
 */

import type { Signals, TechnicalSignal } from "./types";

export const CRITICAL_SCHEMAS = [
  "Organization",
  "WebSite",
  "BreadcrumbList",
  "FAQPage",
  "HowTo",
  "Article",
  "BlogPosting",
  "AggregateRating",
  "SoftwareApplication",
];

export function generateTechnicalSignals(signals: Signals): TechnicalSignal[] {
  const items: TechnicalSignal[] = [];

  // Title
  const titleStatus: "good" | "warning" | "bad" =
    signals.title_len >= 30 && signals.title_len <= 65 ? "good" : signals.title_len > 0 ? "warning" : "bad";
  items.push({
    label: "Title tag",
    value: signals.title ? `${signals.title.slice(0, 70)}${signals.title.length > 70 ? "..." : ""} (${signals.title_len} chars)` : "Missing",
    status: titleStatus,
  });

  // Meta description
  const metaStatus: "good" | "warning" | "bad" =
    signals.meta_desc_len >= 80 && signals.meta_desc_len <= 160 ? "good" : signals.meta_desc_len > 0 ? "warning" : "bad";
  items.push({
    label: "Meta description",
    value: signals.meta_desc ? `${signals.meta_desc.slice(0, 80)}${signals.meta_desc.length > 80 ? "..." : ""} (${signals.meta_desc_len} chars)` : "Missing",
    status: metaStatus,
  });

  // Canonical
  items.push({
    label: "Canonical URL",
    value: signals.canonical ? signals.canonical.slice(0, 60) : "Not set",
    status: signals.canonical ? "good" : "bad",
  });

  // OG image
  items.push({
    label: "og:image",
    value: signals.og_image ? "Present" : "Missing",
    status: signals.og_image ? "good" : "bad",
  });

  // H1
  const h1Status: "good" | "warning" | "bad" = signals.h1_count === 1 ? "good" : signals.h1_count === 0 ? "bad" : "warning";
  items.push({
    label: "H1 structure",
    value: signals.h1_count === 1 ? `Clean (1 H1: "${signals.h1_first?.slice(0, 50) || ""}...")` : signals.h1_count === 0 ? "No H1 found" : `${signals.h1_count} H1 tags (should be 1)`,
    status: h1Status,
  });

  // External links
  const extStatus: "good" | "warning" | "bad" = signals.links_external >= 3 ? "good" : signals.links_external >= 1 ? "warning" : "bad";
  items.push({
    label: "External links",
    value: `${signals.links_external} outbound link${signals.links_external !== 1 ? "s" : ""}${signals.links_external >= 3 ? " — strong trust signal" : signals.links_external >= 1 ? " — moderate signal" : " — weak authority signal"}`,
    status: extStatus,
  });

  // Word count
  const wcStatus: "good" | "warning" | "bad" = signals.word_count >= 300 ? "good" : signals.word_count >= 150 ? "warning" : "bad";
  items.push({
    label: "Word count",
    value: `${signals.word_count} words${signals.word_count < 300 ? " (thin content)" : ""}`,
    status: wcStatus,
  });

  // Authority — named author (Phase 4A). 2.3x citation lift in
  // CMU GEO research when content has a named author signal.
  const hasAuthor = !!signals.author_meta || signals.has_person_schema;
  items.push({
    label: "Named author",
    value: hasAuthor
      ? (signals.author_meta
          ? `Author: ${signals.author_meta.slice(0, 60)}`
          : "Person schema present")
      : "No author meta or Person schema -- AI engines can't attribute authorship",
    status: hasAuthor ? "good" : "warning",
  });

  // Authority — trust-profile outbound links (Phase 4A). Brands with
  // links to G2/Trustpilot/Capterra/etc. on their site see ~3x lift
  // because AI engines pull review-platform context when answering.
  const trustCount = signals.trust_profile_links.length;
  const trustPlatforms = [...new Set(signals.trust_profile_links.map(t => t.platform))];
  items.push({
    label: "Trust-platform links",
    value: trustCount > 0
      ? `${trustCount} link${trustCount === 1 ? "" : "s"} to ${trustPlatforms.join(", ")}`
      : "No links to G2 / Trustpilot / Capterra / Yelp / BBB / GBP detected",
    status: trustCount >= 2 ? "good" : trustCount === 1 ? "warning" : "bad",
  });

  return items;
}

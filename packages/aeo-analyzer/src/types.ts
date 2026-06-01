/**
 * AEO Analyzer — Shared type definitions
 */

export interface Signals {
  title: string | null;
  title_len: number;
  meta_desc: string | null;
  meta_desc_len: number;
  canonical: string | null;
  robots_meta: string | null;
  og_title: boolean;
  og_description: boolean;
  og_image: boolean;
  og_type: boolean;
  twitter_card: boolean;
  twitter_image: boolean;
  h1_count: number;
  h1_first: string | null;
  jsonld_block_count: number;
  jsonld_parse_errors: number;
  schema_types: string[];
  img_count: number;
  img_no_alt: number;
  links_internal: number;
  links_external: number;
  word_count: number;
  has_rating_text: boolean;
  has_testimonial_text: boolean;
  // Authority signals (Phase 4A). Per CMU GEO research, named-author
  // pages see ~2.3x citation lift; trust-platform presence (G2 /
  // Trustpilot / Capterra / etc.) drives ~3x.
  author_meta: string | null;
  has_person_schema: boolean;
  /** Raw Person nodes detected in JSON-LD (Phase 4B). Captured so the
   *  schema-grader can score completeness instead of treating any
   *  Person presence as equivalent. Empty array when no Person
   *  nodes are present. */
  person_nodes: Record<string, unknown>[];
  /** Outbound links matched against the trust-profile platform list,
   *  deduped, in canonical "platform: url" form. Empty if none found. */
  trust_profile_links: { platform: string; url: string }[];
  /** True when the served HTML is an empty JS shell whose content only
   *  appears after client-side rendering. AI crawlers that don't execute
   *  JS see nothing to cite. When true, the per-signal "missing" flags are
   *  suppressed in favor of one clear finding (see flags.ts). */
  client_side_rendered: boolean;
}

export interface Report {
  url: string;
  domain: string;
  signals: Signals;
  schema_coverage: { type: string; present: boolean }[];
  red_flags: string[];
  grade: string;
  aeo_score: number;
  technical_signals: TechnicalSignal[];
  /** Surfaced at top level so UIs and programmatic consumers (the MCP
   *  aeo_scan tool, outreach generators) can branch on it without digging
   *  into signals. When true, the score reflects what a non-JS crawler
   *  sees (near-empty), and red_flags leads with the render explanation. */
  client_side_rendered?: boolean;
}

export interface TechnicalSignal {
  label: string;
  value: string;
  status: "good" | "warning" | "bad";
}

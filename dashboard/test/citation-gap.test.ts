/**
 * Tests for dashboard/src/citation-gap.ts
 *
 * Coverage:
 *   - mdLiteToHtml: bold conversion, bullet lists, paragraphs,
 *     ### heading strip, code spans, empty input
 *   - renderCitationGapPanel: empty-report path, gap-report path,
 *     full-table rendering
 *
 * Out of scope (would need D1 mocks):
 *   - buildCitationGapReport (D1 plumbing)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mdLiteToHtml, renderCitationGapPanel, gapToRoadmapItem } from "../src/citation-gap.ts";

// ---------------------------------------------------------------------
// mdLiteToHtml
// ---------------------------------------------------------------------

test("mdLiteToHtml strips a leading ### heading", () => {
  const html = mdLiteToHtml("### Wikipedia -- en.wikipedia.org\n\nbody text");
  assert.doesNotMatch(html, /Wikipedia/);
  assert.match(html, /body text/);
});

test("mdLiteToHtml converts **bold** to <strong>", () => {
  const html = mdLiteToHtml("**Action:** edit the entry");
  assert.match(html, /<strong>Action:<\/strong>/);
});

test("mdLiteToHtml converts bullet lists with surrounding paragraphs", () => {
  const html = mdLiteToHtml("Para before.\n- item one\n- item two\nPara after.");
  assert.match(html, /<ul/);
  assert.match(html, /<li[^>]*>item one<\/li>/);
  assert.match(html, /<li[^>]*>item two<\/li>/);
  assert.match(html, /<\/ul>/);
  assert.match(html, /<p[^>]*>Para before\.<\/p>/);
  assert.match(html, /<p[^>]*>Para after\.<\/p>/);
});

test("mdLiteToHtml renders standalone paragraphs", () => {
  const html = mdLiteToHtml("First line.\nSecond line.");
  assert.match(html, /First line/);
  assert.match(html, /Second line/);
});

test("mdLiteToHtml handles inline code spans", () => {
  const html = mdLiteToHtml("Use the `--client-slug` flag.");
  assert.match(html, /<code[^>]*>--client-slug<\/code>/);
});

test("mdLiteToHtml escapes HTML in input", () => {
  const html = mdLiteToHtml("Watch out for <script>alert(1)</script>");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("mdLiteToHtml handles empty input gracefully", () => {
  assert.equal(mdLiteToHtml(""), "");
  assert.equal(mdLiteToHtml("\n\n"), "");
});

test("mdLiteToHtml handles trailing list with no following paragraph", () => {
  const html = mdLiteToHtml("- only\n- two\n- items");
  assert.match(html, /<ul/);
  assert.match(html, /<\/ul>/);
  // Three items rendered
  const items = html.match(/<li/g) || [];
  assert.equal(items.length, 3);
});

// ---------------------------------------------------------------------
// renderCitationGapPanel
// ---------------------------------------------------------------------

const mkReport = (overrides: any = {}) => ({
  client_slug: "test-client",
  summary: {
    total_runs: 30,
    total_runs_naming_client: 15,
    runs_naming_client_ratio: 0.5,
    unique_sources: 5,
    sources_with_meaningful_gap: 2,
    top_keywords: [{ keyword: "best widget", runs: 10 }],
    ...overrides.summary,
  },
  sources: overrides.sources ?? [
    {
      domain: "example.com",
      source_type: "other",
      source_label: "Other source",
      action: "investigate",
      total_runs: 30,
      unique_urls: 25,
      engines: ["openai"],
      keywords: ["best widget"],
      client_named_runs: 15,
      client_named_ratio: 0.5,
      is_client_owned: false,
      gap_score: 0.4,
      example_urls: ["https://example.com/x"],
    },
  ],
  sources_with_gap: overrides.sources_with_gap ?? [],
});

test("renderCitationGapPanel returns empty string for null report", () => {
  assert.equal(renderCitationGapPanel(null), "");
});

test("renderCitationGapPanel emits the empty-state panel when no gaps", () => {
  const r = mkReport({
    summary: {
      total_runs: 30,
      total_runs_naming_client: 30,
      runs_naming_client_ratio: 1,
      unique_sources: 5,
      sources_with_meaningful_gap: 0,
      top_keywords: [],
    },
    sources_with_gap: [],
  });
  const html = renderCitationGapPanel(r);
  assert.match(html, /Source coverage/);
  assert.match(html, /No source-level gaps cross the action threshold/);
});

test("renderCitationGapPanel emits brief blocks for gap sources", () => {
  const gapSource = {
    domain: "en.wikipedia.org",
    source_type: "wikipedia",
    source_label: "Wikipedia",
    action: "edit-or-create-entity-entry",
    total_runs: 10,
    unique_urls: 5,
    engines: ["openai", "perplexity"],
    keywords: ["best widget"],
    client_named_runs: 0,
    client_named_ratio: 0,
    is_client_owned: false,
    gap_score: 0.9,
    example_urls: ["https://en.wikipedia.org/wiki/X"],
  };
  const r = mkReport({
    sources: [gapSource],
    sources_with_gap: [gapSource],
    summary: {
      total_runs: 10,
      total_runs_naming_client: 0,
      runs_naming_client_ratio: 0,
      unique_sources: 1,
      sources_with_meaningful_gap: 1,
      top_keywords: [{ keyword: "best widget", runs: 10 }],
    },
  });
  const html = renderCitationGapPanel(r);
  assert.match(html, /Source-level gaps/);
  assert.match(html, /Wikipedia/);
  assert.match(html, /en\.wikipedia\.org/);
  assert.match(html, /<details/);
  // Brief content should surface from the source-type library
  assert.match(html, /notability sourcing/);
});

test("renderCitationGapPanel surfaces top-line stats", () => {
  const r = mkReport({
    summary: {
      total_runs: 100,
      total_runs_naming_client: 30,
      runs_naming_client_ratio: 0.3,
      unique_sources: 12,
      sources_with_meaningful_gap: 4,
      top_keywords: [],
    },
    sources_with_gap: [
      {
        domain: "x.com",
        source_type: "social",
        source_label: "Social",
        action: "publish-canonical-bio-and-post",
        total_runs: 5,
        unique_urls: 5,
        engines: ["openai"],
        keywords: ["x"],
        client_named_runs: 0,
        client_named_ratio: 0,
        is_client_owned: false,
        gap_score: 0.9,
        example_urls: ["https://x.com/test"],
      },
    ],
  });
  const html = renderCitationGapPanel(r);
  assert.match(html, /30 of 100/);
  assert.match(html, /30%/);
  assert.match(html, /12 source domain/);
  assert.match(html, /4 with action/);
});

test("renderCitationGapPanel includes the full source table in details", () => {
  const r = mkReport({
    sources_with_gap: [
      {
        domain: "x.com",
        source_type: "social",
        source_label: "Social",
        action: "x",
        total_runs: 5,
        unique_urls: 5,
        engines: ["openai"],
        keywords: ["x"],
        client_named_runs: 0,
        client_named_ratio: 0,
        is_client_owned: false,
        gap_score: 0.9,
        example_urls: [],
      },
    ],
  });
  const html = renderCitationGapPanel(r);
  // Full table is wrapped in <details><summary>All cited sources...</summary>
  assert.match(html, /All cited sources/);
  assert.match(html, /<table/);
});

test("renderCitationGapPanel respects briefLimit option", () => {
  const fiveGaps = Array.from({ length: 5 }, (_, i) => ({
    domain: `gap${i}.example.com`,
    source_type: "wikipedia",
    source_label: `Source ${i}`,
    action: "x",
    total_runs: 10,
    unique_urls: 10,
    engines: ["openai"],
    keywords: ["x"],
    client_named_runs: 0,
    client_named_ratio: 0,
    is_client_owned: false,
    gap_score: 0.9,
    example_urls: [],
  }));
  const r = mkReport({ sources_with_gap: fiveGaps });
  const limited = renderCitationGapPanel(r, { briefLimit: 2 });
  // briefLimit caps the number of <details> brief blocks. The full
  // table still includes everything.
  const briefMatches = limited.match(/cited \d+x/g) || [];
  assert.equal(briefMatches.length, 2);
});

// ---------------------------------------------------------------------
// gapToRoadmapItem -- pure mapping from gap source to roadmap draft
// ---------------------------------------------------------------------

const mkSource = (overrides: any = {}) => ({
  domain: "en.wikipedia.org",
  source_type: "wikipedia",
  source_label: "Wikipedia",
  action: "Audit and update Wikipedia entry",
  total_runs: 5,
  unique_urls: 5,
  engines: ["openai", "perplexity"],
  keywords: ["best widget"],
  client_named_runs: 0,
  client_named_ratio: 0,
  is_client_owned: false,
  gap_score: 0.9,
  example_urls: ["https://en.wikipedia.org/wiki/X"],
  ...overrides,
});

test("gapToRoadmapItem maps each canonical source type to a stable title", () => {
  const expectedTitles: Record<string, string> = {
    wikipedia: "Update Wikipedia entity entry",
    tripadvisor: "Increase TripAdvisor review density",
    "google-maps": "Complete Google Business Profile",
    yelp: "Claim and enrich Yelp listing",
    reddit: "Seed reddit recommendation thread",
    youtube: "Build YouTube category presence",
    news: "Distribute press release",
    directory: "Claim directory listing with consistent NAP",
    social: "Publish canonical bio on social",
    "review-aggregator": "Claim review-aggregator listing",
    "industry-publication": "Pitch industry publication coverage",
  };
  for (const [type, expected] of Object.entries(expectedTitles)) {
    const draft = gapToRoadmapItem("test-client", mkSource({ source_type: type }));
    assert.equal(draft.title, expected, `wrong title for ${type}`);
  }
});

test("gapToRoadmapItem assigns a category per source type", () => {
  const wiki = gapToRoadmapItem("c", mkSource({ source_type: "wikipedia" }));
  assert.equal(wiki.category, "authority");
  const reddit = gapToRoadmapItem("c", mkSource({ source_type: "reddit" }));
  assert.equal(reddit.category, "content");
  const unknown = gapToRoadmapItem("c", mkSource({ source_type: "unknown-type" }));
  assert.equal(unknown.category, "custom");
});

test("gapToRoadmapItem encodes the source domain in the description for round-trip", () => {
  const draft = gapToRoadmapItem("test-client", mkSource({ domain: "en.wikipedia.org" }));
  assert.match(draft.description, /\[gap-source: en\.wikipedia\.org\]/);
});

test("gapToRoadmapItem includes evidence in the description (engines, runs, gap score)", () => {
  const draft = gapToRoadmapItem("test-client", mkSource({
    total_runs: 12,
    engines: ["openai", "perplexity", "gemini"],
    client_named_runs: 0,
    client_named_ratio: 0,
    gap_score: 0.9,
  }));
  assert.match(draft.description, /Cited 12x/);
  assert.match(draft.description, /openai, perplexity, gemini/);
  assert.match(draft.description, /named in 0/);
  assert.match(draft.description, /Gap score: 0\.90/);
});

test("gapToRoadmapItem stamps refresh_source = 'citation_gap'", () => {
  const draft = gapToRoadmapItem("test-client", mkSource());
  assert.equal(draft.refresh_source, "citation_gap");
});

test("gapToRoadmapItem falls through to 'other' template for unrecognized source types", () => {
  const draft = gapToRoadmapItem("test-client", mkSource({ source_type: "definitely-not-real" }));
  assert.equal(draft.title, "Investigate unclassified citation source");
  assert.equal(draft.category, "custom");
});

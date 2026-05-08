/**
 * Tests for tools/citation-gap/src/brief.mjs
 *
 * Coverage:
 *   - generateSourceBrief: argument validation, integration shape
 *   - inferGap branches: client-owned (no gap), high named-ratio
 *     (defend), mid ratio (reinforce), low ratio (acquire)
 *   - SOURCE_BRIEF_LIBRARY: every canonical source type returns a
 *     brief with the expected shape (action / angle / tone / dont_do)
 *   - Unknown source types fall through to the "other" library
 *   - renderSourceBriefMarkdown: section presence, evidence rendering
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSourceBrief,
  renderSourceBriefMarkdown,
} from "../src/brief.mjs";

// ---------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------

const mkSource = (overrides = {}) => ({
  domain: "example.com",
  source_type: "wikipedia",
  source_label: "Wikipedia",
  action: "edit-or-create-entity-entry",
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

const CLIENT = { slug: "test-client" };

// ---------------------------------------------------------------------
// generateSourceBrief -- integration shape
// ---------------------------------------------------------------------

test("generateSourceBrief returns the structured shape", () => {
  const b = generateSourceBrief(mkSource(), CLIENT);
  assert.equal(b.source_type, "wikipedia");
  assert.equal(b.source_label, "Wikipedia");
  assert.equal(b.domain, "example.com");
  assert.equal(typeof b.action, "string");
  assert.equal(typeof b.gap, "string");
  assert.equal(typeof b.angle, "string");
  assert.ok(Array.isArray(b.tone_notes) && b.tone_notes.length > 0);
  assert.ok(Array.isArray(b.dont_do) && b.dont_do.length > 0);
  assert.equal(typeof b.evidence, "object");
  assert.equal(typeof b.generated_at, "string");
});

// ---------------------------------------------------------------------
// inferGap -- four branches
// ---------------------------------------------------------------------

test("inferGap: client-owned source returns the working-as-intended message", () => {
  const b = generateSourceBrief(
    mkSource({ source_type: "client-owned", is_client_owned: true, client_named_ratio: 1 }),
    CLIENT,
  );
  assert.match(b.gap, /client's own property/);
  assert.match(b.gap, /working as intended/);
});

test("inferGap: high named-ratio (>=0.8) frames as defend-not-invest", () => {
  const b = generateSourceBrief(
    mkSource({ client_named_runs: 9, client_named_ratio: 0.9, total_runs: 10 }),
    CLIENT,
  );
  assert.match(b.gap, /Strong signal/);
  assert.match(b.gap, /Defend rather than invest/);
});

test("inferGap: mid named-ratio (0.4-0.8) frames as reinforce", () => {
  const b = generateSourceBrief(
    mkSource({ client_named_runs: 3, client_named_ratio: 0.5, total_runs: 6 }),
    CLIENT,
  );
  assert.match(b.gap, /Partial coverage/);
  assert.match(b.gap, /Reinforce/);
});

test("inferGap: low named-ratio (<0.4) frames as missing", () => {
  const b = generateSourceBrief(
    mkSource({ client_named_runs: 0, client_named_ratio: 0, total_runs: 5 }),
    CLIENT,
  );
  assert.match(b.gap, /missing from it/);
  assert.match(b.gap, /citation channel/);
});

// ---------------------------------------------------------------------
// SOURCE_BRIEF_LIBRARY -- every canonical source type
// ---------------------------------------------------------------------

const CANONICAL_TYPES = [
  "wikipedia",
  "tripadvisor",
  "google-maps",
  "yelp",
  "reddit",
  "youtube",
  "news",
  "directory",
  "social",
  "review-aggregator",
  "industry-publication",
];

for (const type of CANONICAL_TYPES) {
  test(`SOURCE_BRIEF_LIBRARY: ${type} produces a non-empty brief`, () => {
    const b = generateSourceBrief(
      mkSource({ source_type: type, source_label: type }),
      CLIENT,
    );
    assert.equal(b.source_type, type);
    assert.equal(typeof b.action, "string");
    assert.ok(b.action.length > 20, `action too short for ${type}`);
    assert.equal(typeof b.angle, "string");
    assert.ok(b.angle.length > 20, `angle too short for ${type}`);
    assert.ok(b.tone_notes.length >= 1, `tone_notes empty for ${type}`);
    assert.ok(b.dont_do.length >= 1, `dont_do empty for ${type}`);
  });
}

test("SOURCE_BRIEF_LIBRARY: unknown source type falls through to 'other'", () => {
  const b = generateSourceBrief(
    mkSource({ source_type: "definitely-not-a-real-type", source_label: "Unknown" }),
    CLIENT,
  );
  // The library hits "other" but the source row's source_type is preserved.
  assert.match(b.action, /Investigate/);
  assert.match(b.angle, /Unrecognized source domain/);
});

// ---------------------------------------------------------------------
// Source-type-specific content checks (light coverage; the library is
// curated content, not derived logic)
// ---------------------------------------------------------------------

test("Wikipedia brief mentions notability sourcing", () => {
  const b = generateSourceBrief(mkSource({ source_type: "wikipedia" }), CLIENT);
  assert.match(b.action, /notability sourcing/);
});

test("News brief differentiates wire services from earned press", () => {
  const wire = generateSourceBrief(
    mkSource({ source_type: "news", domain: "globenewswire.com" }),
    CLIENT,
  );
  assert.match(wire.action, /Wire services/);

  const earned = generateSourceBrief(
    mkSource({ source_type: "news", domain: "staradvertiser.com" }),
    CLIENT,
  );
  assert.match(earned.action, /Direct pitch/);
});

test("Reddit brief points to the sister tracker package", () => {
  const b = generateSourceBrief(mkSource({ source_type: "reddit" }), CLIENT);
  assert.match(b.action, /reddit-tracker/);
});

// ---------------------------------------------------------------------
// renderSourceBriefMarkdown -- output shape
// ---------------------------------------------------------------------

test("renderSourceBriefMarkdown emits all expected sections", () => {
  const b = generateSourceBrief(mkSource(), CLIENT);
  const md = renderSourceBriefMarkdown(b);
  assert.match(md, /^### Wikipedia/);
  assert.match(md, /\*\*Action:\*\*/);
  assert.match(md, /\*\*Gap\.\*\*/);
  assert.match(md, /\*\*Angle\.\*\*/);
  assert.match(md, /\*\*Tone notes\.\*\*/);
  assert.match(md, /\*\*Don't-do\.\*\*/);
  assert.match(md, /\*\*Evidence\.\*\*/);
});

test("renderSourceBriefMarkdown surfaces engines + keywords + named-ratio", () => {
  const b = generateSourceBrief(
    mkSource({
      engines: ["openai", "perplexity"],
      keywords: ["best widget", "top widget"],
      client_named_runs: 3,
      client_named_ratio: 0.5,
      total_runs: 6,
    }),
    CLIENT,
  );
  const md = renderSourceBriefMarkdown(b);
  assert.match(md, /openai, perplexity/);
  assert.match(md, /best widget/);
  assert.match(md, /Client named in 3/);
  assert.match(md, /50%/);
});

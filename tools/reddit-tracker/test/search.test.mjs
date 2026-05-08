/**
 * Tests for tools/reddit-tracker/src/search.mjs
 *
 * Coverage: buildQueryVariants across the three query shapes (best /
 * question / noun), region scoping, deduplication of identical
 * variants. Does NOT exercise discoverThreads (network).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueryVariants } from "../src/search.mjs";

test("buildQueryVariants for 'best X for Y' shape", () => {
  const v = buildQueryVariants("best CRM for real estate");
  // Always includes the raw query
  assert.ok(v.includes("best CRM for real estate"));
  // Drops leading "best" for broader recall
  assert.ok(v.includes("CRM for real estate"));
  // Adds "recommendations" framing
  assert.ok(v.includes("CRM for real estate recommendations"));
  // Adds "vs" for comparisons (best-shape only)
  assert.ok(v.includes("CRM for real estate vs"));
});

test("buildQueryVariants for question shape ('what X should I take')", () => {
  const v = buildQueryVariants("what NMLS course should I take");
  // Raw query preserved
  assert.ok(v.includes("what NMLS course should I take"));
  // bareCategory strips question shape
  assert.ok(v.includes("NMLS course"));
  // Question shape adds "anyone tried"
  assert.ok(v.includes("anyone tried NMLS course"));
  // And "best X" framing
  assert.ok(v.includes("best NMLS course"));
});

test("buildQueryVariants for bare-noun shape", () => {
  const v = buildQueryVariants("podcast hosting platform");
  assert.ok(v.includes("podcast hosting platform"));
  assert.ok(v.includes("podcast hosting platform recommendations"));
  // Noun shape adds "best X" and "X vs"
  assert.ok(v.includes("best podcast hosting platform"));
  assert.ok(v.includes("podcast hosting platform vs"));
});

test("buildQueryVariants adds region-scoped variants when region given", () => {
  const v = buildQueryVariants("best CRM for real estate", "Hawaii");
  assert.ok(v.some((q) => q.includes("Hawaii")));
  // Both "<bare> Hawaii" and "Hawaii <bare>"
  assert.ok(v.includes("CRM for real estate Hawaii"));
  assert.ok(v.includes("Hawaii CRM for real estate"));
});

test("buildQueryVariants does not duplicate identical variants", () => {
  const v = buildQueryVariants("best CRM for real estate");
  const set = new Set(v);
  assert.equal(v.length, set.size);
});

test("buildQueryVariants returns at least the raw query for any input", () => {
  const v = buildQueryVariants("anything");
  assert.ok(v.length > 0);
  assert.ok(v.includes("anything"));
});

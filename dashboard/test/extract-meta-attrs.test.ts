/**
 * Attribute-order independence in extractMeta.
 *
 * Regression guard for the 2026-09-02 bug: the description, canonical, robots
 * and author extractors anchored their key attribute to the front of the tag
 * (/<meta\s+name=["']description["']/), so any tag carrying another attribute
 * first was invisible. React Helmet and Next.js Head both emit
 * <meta data-react-helmet="true" name="description" ...>, which meant a large
 * share of modern sites were reported as missing tags they actually have.
 *
 * The robots case is why this is a correctness bug and not a cosmetic one: a
 * missed noindex makes the scanner report a page as citable while the page is
 * telling crawlers to stay away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMeta } from "../../packages/aeo-analyzer/src/extract.ts";

const URL_ = "https://example.com/";
const page = (head: string) => `<html><head><title>T</title>${head}</head><body><h1>x</h1></body></html>`;

test("React Helmet shape: an attribute BEFORE name= still yields the description", () => {
  const s = extractMeta(page(
    `<meta data-react-helmet="true" name="description" content="Seven storage facilities."/>`), URL_);
  assert.equal(s.meta_desc, "Seven storage facilities.");
});

test("React Helmet shape: canonical is found with a leading attribute", () => {
  const s = extractMeta(page(
    `<link data-react-helmet="true" rel="canonical" href="https://example.com/"/>`), URL_);
  assert.equal(s.canonical, "https://example.com/");
});

test("CRITICAL: a noindex robots tag with a leading attribute is not missed", () => {
  // If this regresses, the scanner calls a noindexed page citable.
  const s = extractMeta(page(
    `<meta data-next-head="" name="robots" content="noindex,nofollow"/>`), URL_);
  assert.equal(s.robots_meta, "noindex,nofollow");
});

test("author survives a leading attribute", () => {
  const s = extractMeta(page(
    `<meta data-react-helmet="true" name="author" content="Jane Doe"/>`), URL_);
  assert.equal(s.author_meta, "Jane Doe");
});

test("the plain canonical-order shapes still work", () => {
  const s = extractMeta(page(
    `<meta name="description" content="Plain."/>`
    + `<link rel="canonical" href="https://example.com/p"/>`
    + `<meta name="robots" content="index,follow"/>`), URL_);
  assert.equal(s.meta_desc, "Plain.");
  assert.equal(s.canonical, "https://example.com/p");
  assert.equal(s.robots_meta, "index,follow");
});

test("reversed order, content before name, still works", () => {
  const s = extractMeta(page(`<meta content="Backwards." name="description"/>`), URL_);
  assert.equal(s.meta_desc, "Backwards.");
});

test("single quotes are handled", () => {
  const s = extractMeta(page(`<meta data-x='1' name='description' content='Single quoted.'/>`), URL_);
  assert.equal(s.meta_desc, "Single quoted.");
});

test("rel carrying several tokens still resolves canonical", () => {
  const s = extractMeta(page(`<link rel="canonical alternate" href="https://example.com/multi"/>`), URL_);
  assert.equal(s.canonical, "https://example.com/multi");
});

test("NO false positives: absent tags stay null", () => {
  const s = extractMeta(page(`<meta name="viewport" content="width=device-width"/>`), URL_);
  assert.equal(s.meta_desc, null);
  assert.equal(s.canonical, null);
  assert.equal(s.robots_meta, null);
  assert.equal(s.author_meta, null);
});

test("a description-like attribute on an unrelated tag is not picked up", () => {
  // og:description is a property, not a name. It must not satisfy name=description.
  const s = extractMeta(page(`<meta property="og:description" content="Social copy."/>`), URL_);
  assert.equal(s.meta_desc, null);
});

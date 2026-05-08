/**
 * Tests for tools/citation-gap/src/source-types.mjs
 *
 * Coverage:
 *   - extractDomain: URL parsing, www stripping, case normalization
 *   - classifyUrl: per-source-type matching, domain-suffix logic,
 *     path-aware logic, homoglyph rejection, client-owned override
 *   - isClientOwnedUrl: subdomain matching
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDomain,
  classifyUrl,
  isClientOwnedUrl,
} from "../src/source-types.mjs";

// ---------------------------------------------------------------------
// extractDomain
// ---------------------------------------------------------------------

test("extractDomain strips www and lowercases", () => {
  assert.equal(extractDomain("https://www.Example.COM/path"), "example.com");
  assert.equal(extractDomain("https://EXAMPLE.com"), "example.com");
});

test("extractDomain returns null for invalid URLs", () => {
  assert.equal(extractDomain(""), null);
  assert.equal(extractDomain(null), null);
  assert.equal(extractDomain("not a url"), null);
});

test("extractDomain handles ports and paths", () => {
  assert.equal(extractDomain("https://example.com:8080/foo"), "example.com");
});

// ---------------------------------------------------------------------
// classifyUrl -- domain-suffix matcher
// ---------------------------------------------------------------------

test("classifyUrl recognizes the eleven canonical source types", () => {
  assert.equal(classifyUrl("https://en.wikipedia.org/wiki/X").type, "wikipedia");
  assert.equal(classifyUrl("https://www.tripadvisor.com/x").type, "tripadvisor");
  assert.equal(classifyUrl("https://www.google.com/maps/search/x").type, "google-maps");
  assert.equal(classifyUrl("https://www.yelp.com/biz/x").type, "yelp");
  assert.equal(classifyUrl("https://www.reddit.com/r/x").type, "reddit");
  assert.equal(classifyUrl("https://youtube.com/watch?v=x").type, "youtube");
  assert.equal(classifyUrl("https://www.globenewswire.com/x").type, "news");
  assert.equal(classifyUrl("https://staradvertiser.com/x").type, "news");
  assert.equal(classifyUrl("https://www.ticketmaster.com/x").type, "directory");
  assert.equal(classifyUrl("https://x.com/post").type, "social");
  assert.equal(classifyUrl("https://www.linkedin.com/in/x").type, "social");
  assert.equal(classifyUrl("https://www.g2.com/x").type, "review-aggregator");
  assert.equal(classifyUrl("https://hbr.org/x").type, "industry-publication");
});

test("classifyUrl uses domain-suffix matching, not substring", () => {
  // Audit fix: "ommax.com" used to match "x.com" via substring;
  // proper domain-suffix logic excludes it.
  assert.equal(classifyUrl("https://ommax.com/about").type, "other");
  assert.equal(classifyUrl("https://leadgeneratorx.com/x").type, "other");
  // But x.com itself and *.x.com still match social.
  assert.equal(classifyUrl("https://x.com/post").type, "social");
});

test("classifyUrl path matchers require path containment", () => {
  // "google.com/maps" only matches /maps URLs.
  assert.equal(classifyUrl("https://www.google.com/maps/search/x").type, "google-maps");
  assert.equal(classifyUrl("https://www.google.com/search?q=x").type, "other");
});

test("classifyUrl rejects homoglyph attacks", () => {
  // reddit.com.fake is the suffix-attack class. Must NOT match reddit.
  assert.equal(classifyUrl("https://reddit.com.fake/r/x").type, "other");
  // fake-prefix subdomains too
  assert.equal(classifyUrl("https://fakegoogle.com/maps/x").type, "other");
});

test("classifyUrl is case-insensitive on domain", () => {
  assert.equal(classifyUrl("https://EN.WIKIPEDIA.ORG/wiki/X").type, "wikipedia");
});

test("classifyUrl gracefully handles invalid URLs", () => {
  assert.equal(classifyUrl("").type, "other");
  assert.equal(classifyUrl(null).type, "other");
  assert.equal(classifyUrl("not a url").type, "other");
});

// ---------------------------------------------------------------------
// classifyUrl with clientDomains -- client-owned override
// ---------------------------------------------------------------------

test("classifyUrl returns 'client-owned' when URL matches client domain", () => {
  const c = classifyUrl("https://hawaiitheatre.com/", ["hawaiitheatre.com"]);
  assert.equal(c.type, "client-owned");
  assert.equal(c.action, "monitor");
});

test("classifyUrl client-owned override matches subdomains", () => {
  const c = classifyUrl("https://shop.acmecrm.com/items", ["acmecrm.com"]);
  assert.equal(c.type, "client-owned");
});

test("classifyUrl client-owned does NOT trigger on prefix collisions", () => {
  // "evilacmecrm.com" should not match a client-owned "acmecrm.com"
  const c = classifyUrl("https://evilacmecrm.com/", ["acmecrm.com"]);
  assert.notEqual(c.type, "client-owned");
});

// ---------------------------------------------------------------------
// isClientOwnedUrl
// ---------------------------------------------------------------------

test("isClientOwnedUrl matches exact and subdomain", () => {
  assert.equal(isClientOwnedUrl("https://acmecrm.com/", ["acmecrm.com"]), true);
  assert.equal(isClientOwnedUrl("https://www.acmecrm.com/", ["acmecrm.com"]), true);
  assert.equal(isClientOwnedUrl("https://shop.acmecrm.com/", ["acmecrm.com"]), true);
});

test("isClientOwnedUrl rejects unrelated and prefix-attack domains", () => {
  assert.equal(isClientOwnedUrl("https://other.com/", ["acmecrm.com"]), false);
  assert.equal(isClientOwnedUrl("https://acmecrm.com.evil.com/", ["acmecrm.com"]), false);
  assert.equal(isClientOwnedUrl("https://evilacmecrm.com/", ["acmecrm.com"]), false);
});

test("isClientOwnedUrl handles missing client domains", () => {
  assert.equal(isClientOwnedUrl("https://anything.com/", []), false);
  assert.equal(isClientOwnedUrl("https://anything.com/", null), false);
  assert.equal(isClientOwnedUrl("https://anything.com/", undefined), false);
});

test("isClientOwnedUrl normalizes input domains (strips https/www)", () => {
  assert.equal(isClientOwnedUrl("https://acmecrm.com/", ["https://www.acmecrm.com/"]), true);
});

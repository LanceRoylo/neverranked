/**
 * The "Ask it yourself" kit prefills its questions from the scanned page's
 * own JSON-LD, never from a guess. A field the page does not state stays
 * empty and the kit shows an editable placeholder.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractIdentity, cleanField } from "../../tools/schema-check/src/identity.ts";
import { KIT_QUESTIONS, PAGE_COPY } from "../../tools/schema-check/src/copy.ts";

test("category and town come from the page's JSON-LD", () => {
  const html = `<title>Acme Plumbing | Austin</title>
    <meta property="og:site_name" content="Acme Plumbing Co">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebSite","name":"Acme site"},
      {"@type":["LocalBusiness","Plumber"],"name":"Acme Plumbing","address":{"@type":"PostalAddress","addressLocality":"Austin"}}
    ]}</script>`;
  const id = extractIdentity(html);
  assert.equal(id.category, "plumber");
  assert.equal(id.town, "Austin");
  assert.equal(id.name, "Acme Plumbing");
  assert.equal(id.og_site_name, "Acme Plumbing Co");
});

test("nothing stated means nothing guessed", () => {
  const id = extractIdentity(`<title>Welcome</title><script type="application/ld+json">{"@type":"Organization"}</script>`);
  assert.equal(id.category, null);
  assert.equal(id.town, null);
  assert.equal(id.name, "Welcome");
});

test("hostile or broken JSON-LD cannot inject markup or run long", () => {
  const html = `<script type="application/ld+json">{"@type":"Dentist","name":"<img src=x onerror=alert(1)>Evil","address":{"addressLocality":"${"A".repeat(500)}"}}</script>
    <script type="application/ld+json">{not json</script>`;
  const id = extractIdentity(html);
  assert.equal(id.category, "dentist");
  assert.ok(!/[<>]/.test(id.name ?? ""));
  assert.ok((id.town ?? "").length <= 40);
  assert.equal(cleanField("  a\u0000b  "), "a b");
});

test("the kit questions are the plan's three fixed templates", () => {
  assert.equal(KIT_QUESTIONS.length, 3);
  for (const q of KIT_QUESTIONS) assert.match(q, /\{town\}\?$/);
  assert.equal(PAGE_COPY.kitCategoryPlaceholder, "[what you do]");
  assert.equal(PAGE_COPY.kitTownPlaceholder, "[your town]");
});

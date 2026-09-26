/* A readout names the question set that produced it.
 *
 * The methodology page says "hash-locked" five times. The Worker has hashed the
 * set daily since query_set_versions existed and alerts on every change, so the
 * claim was never empty. What was missing was the BINDING: nothing on a stored
 * snapshot named the set behind it, so a delivered readout could be tied to a
 * question set only by inferring from dates in another table. Defensible, but
 * not demonstrable, which is the wrong side of the line for a practice that
 * sells falsifiability.
 *
 * I spent several days telling Lance the Worker produced no hash at all. It
 * did. The real gap was one column. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CITATIONS = fs.readFileSync(new URL("../src/citations.ts", import.meta.url), "utf8");
const ROUTES = fs.readFileSync(new URL("../src/routes/admin-memos.ts", import.meta.url), "utf8");

test("the snapshot stamps a query set hash", () => {
  assert.match(CITATIONS, /query_set_hash/, "the column must be written");
  assert.match(CITATIONS, /querySetHash = await hashQuerySet\(await activeQuerySet\(env, clientSlug\)\)/,
    "it must be computed at build time from the active set");
});

test("it reuses the same hash function as the change log", () => {
  // A hash computed differently here would match nothing in
  // query_set_versions and would prove nothing at all, which is worse than
  // having no hash.
  assert.match(CITATIONS, /import\("\.\/lib\/query-set"\)/);
  assert.doesNotMatch(CITATIONS.slice(CITATIONS.indexOf("Bind this readout")), /crypto\.subtle\.digest/,
    "it must not roll its own digest");
});

test("a set that changed inside the window is recorded, not hidden", () => {
  assert.match(CITATIONS, /query_set_changed_in_window/);
  assert.match(CITATIONS, /observed_at > \? AND observed_at <= \?/,
    "the check must be scoped to the snapshot's own window");
});

test("a hash that cannot be computed stays null rather than wrong", () => {
  const i = CITATIONS.indexOf("Bind this readout");
  const block = CITATIONS.slice(i, i + 1600);
  assert.match(block, /let querySetHash: string \| null = null/);
  assert.match(block, /catch \(e\) \{/, "failure must leave it null, never guess");
});

test("the rebuild route shows the hash and the mid-window change", () => {
  assert.match(ROUTES, /query_set_hash/);
  assert.match(ROUTES, /not stamped/, "an unstamped snapshot must say so");
  assert.match(ROUTES, /the set CHANGED inside this window/);
});

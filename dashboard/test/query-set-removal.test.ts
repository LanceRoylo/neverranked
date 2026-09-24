/* Removing questions inflates a figure as surely as adding them, and more
 * quietly. 2026-09-24: prince-waikiki lost 12 of 30 -- the nine zero-citation
 * questions the memo leads with, plus three more -- and the alert read like a
 * routine change notice. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/lib/query-set.ts", import.meta.url), "utf8");

test("a removal is titled as a removal, not as a change", () => {
  assert.match(SRC, /question\(s\) REMOVED from/,
    "a drop in a measured set must be unmissable in the alert title");
});

test("the alert compares what was removed against what was kept", () => {
  assert.match(SRC, /citation rate against/);
  assert.match(SRC, /rises by removal alone/,
    "the alert must say that dropping weak questions inflates the headline");
});

test("a warning that cannot be computed never loses the alert", () => {
  // The coverage query is wrapped: a failure must degrade to the plain alert.
  const idx = SRC.indexOf("removalWarning = \"\"");
  assert.ok(idx > 0);
  assert.match(SRC.slice(idx, idx + 1800), /catch \{[^}]*\}/,
    "the removal-warning computation must be isolated from the alert write");
});

test("deactivation is stamped where it happens", () => {
  const routes = fs.readFileSync(new URL("../src/routes/citations.ts", import.meta.url), "utf8");
  assert.match(routes, /deactivated_at = unixepoch\(\)/,
    "the admin deactivate path must record when and why");
});

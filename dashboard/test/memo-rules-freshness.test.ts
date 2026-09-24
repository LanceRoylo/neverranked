/* A draft carries the rules that produced it, and delivery checks them.
 *
 * 2026-09-24: the memo regenerates on the 15th and the 24th. The 24th ran at
 * 06:03. Three generator fixes shipped later that day, the last of them
 * written specifically to stop the memo prescribing robots.txt for a surface
 * that fetches nothing. The draft waiting to be delivered still contained that
 * line, every existing gate passed it, and nothing in the system knew the
 * rules had moved underneath it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { memoRulesHash } from "../src/lib/memo-generator";

const GEN = fs.readFileSync(new URL("../src/lib/memo-generator.ts", import.meta.url), "utf8");
const ROUTES = fs.readFileSync(new URL("../src/routes/admin-memos.ts", import.meta.url), "utf8");

test("the hash is stable across calls", async () => {
  assert.equal(await memoRulesHash(), await memoRulesHash());
});

test("the hash is a short hex digest", async () => {
  assert.match(await memoRulesHash(), /^[0-9a-f]{12}$/);
});

test("the hash covers the prompt, so a rule change always moves it", () => {
  // Hashing the prompt itself rather than a build id is the point: an
  // unrelated deploy must not invalidate a draft, and a rule change must.
  assert.match(GEN, /MEMO_AUTHOR_SYSTEM \+ "\\u0000" \+ INPUT_CONTRACT_REVISION/,
    "the digest material must be the prompt plus the input-contract revision");
});

test("input-shape changes are covered too, since they move a memo without touching the prompt", () => {
  assert.match(GEN, /const INPUT_CONTRACT_REVISION = "/);
});

test("generation records the rules that produced the draft", () => {
  assert.match(GEN, /rules_hash = excluded\.rules_hash/,
    "a regenerate must refresh the recorded rules, not keep the old ones");
  assert.match(GEN, /await memoRulesHash\(\)/);
});

test("delivery blocks a draft written under different rules", () => {
  assert.match(ROUTES, /memo\.rules_hash !== current/);
  assert.match(ROUTES, /\|\| staleRules\)/, "stale rules must join the fail-closed gate");
});

test("a draft predating rule tracking is treated as unknown, not as current", () => {
  assert.match(ROUTES, /predates rule tracking/,
    "a NULL hash must block rather than silently pass");
});

test("the freshness check cannot itself break delivery", () => {
  const i = ROUTES.indexOf("let staleRules");
  assert.ok(i > 0);
  assert.match(ROUTES.slice(i, i + 1200), /catch \{[^}]*\}/,
    "a check that cannot run must not block delivery on its own");
});

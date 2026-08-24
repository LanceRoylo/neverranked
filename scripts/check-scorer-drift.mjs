/**
 * check-scorer-drift.mjs — the agent-readiness scorer exists in two files.
 * This fails the build when they stop agreeing.
 *
 * Why this exists rather than a refactor: the scorer lives in
 *   mcp-server/src/tools/agent-readiness-check.ts   (published as @neverranked/mcp)
 *   tools/schema-check/src/scoring-ports.ts         (imported by the worker + dashboard)
 * and the npm package compiles only from its own src/, so collapsing them to
 * one module means restructuring the package. That is the right fix, and it
 * is not a thing to do days before a paying client goes live.
 *
 * The failure this guards is real and already happened elsewhere in this
 * repo: orchestrate.mjs kept a hand-maintained copy of a client-slug map the
 * registry already held, and prince_waikiki was missing from it. Duplicated
 * logic drifts silently, and here drift means two different scores for the
 * same site -- one in a client's cross-map, another from the public tool
 * they could check us with.
 *
 * Compares the SCORING RULES only (weights, thresholds, boilerplate tests),
 * not prose or formatting, so cosmetic edits do not cry wolf.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const A = join(ROOT, "mcp-server/src/tools/agent-readiness-check.ts");
const B = join(ROOT, "tools/schema-check/src/scoring-ports.ts");

// The load-bearing numbers and predicates. If any of these differ, the two
// implementations can return different scores for identical markup.
const SIGNATURE = [
  /search_term_string/g,
  /coverage \* 60/g,
  /Math\.min\(10, substantive\.length \* 5\)/g,
  /20 - Math\.min\(20, totalIssues \* 5\)/g,
  /reachableCount \/ relevant\.length\) \* 20/g,
  /if \(!c\.target\) return true;/g,
];

function fingerprint(src) {
  return SIGNATURE.map((re) => (src.match(re) || []).length).join("|");
}

const fa = fingerprint(readFileSync(A, "utf8"));
const fb = fingerprint(readFileSync(B, "utf8"));

if (fa !== fb) {
  console.error("\n✗ check-scorer-drift: the two agent-readiness scorers disagree.\n");
  console.error(`  mcp-server/src/tools/agent-readiness-check.ts  ${fa}`);
  console.error(`  tools/schema-check/src/scoring-ports.ts        ${fb}\n`);
  console.error("  Each slot is one scoring rule: boilerplate test, vertical weight,");
  console.error("  off-baseline cap, validation penalty, reachability weight, fragment test.");
  console.error("  A mismatch means the same site can score differently depending on which");
  console.error("  path a client happens to hit. Change both, or collapse them.\n");
  process.exit(1);
}
console.log(`✓ check-scorer-drift: both agent-readiness scorers agree (${fa}).`);

/**
 * check-scorer-drift.mjs — there must be exactly ONE agent-readiness scorer.
 *
 * Until 2026-08-24 this compared two implementations and failed when they
 * disagreed. They have since been collapsed: mcp-server/src/tools/* is the
 * single source, and tools/schema-check/src/scoring-ports.ts re-exports it.
 *
 * So the check changed shape. Comparing copies is no longer the job. Making
 * sure a second copy never comes back is.
 *
 * Why this keeps mattering: two copies of a scoring rule means the same site
 * can score differently depending on which path a client hits -- one number
 * in their cross-map, another from the public tool they would check us with.
 * For a company selling independent measurement that is the worst available
 * bug, and the repo has produced this shape three times (a client-slug map
 * duplicating the registry, a wrapper duplicating a delete, this scorer).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = join(ROOT, "tools/schema-check/src/scoring-ports.ts");
const SOURCE = join(ROOT, "mcp-server/src/tools/agent-readiness-check.ts");

const port = readFileSync(PORT, "utf8");
const source = readFileSync(SOURCE, "utf8");
const fails = [];

// The port must re-export, never implement.
if (!/export\s*\{\s*agentReadinessCheck\s*\}\s*from/.test(port)) {
  fails.push("scoring-ports.ts no longer re-exports agentReadinessCheck from mcp-server.");
}
// Scoring rules appearing in the port mean an implementation has grown back.
for (const [label, re] of [
  ["vertical weight", /coverage \* 60/],
  ["off-baseline cap", /Math\.min\(10, substantive\.length \* 5\)/],
  ["boilerplate predicate", /search_term_string/],
]) {
  if (re.test(port)) fails.push(`scoring-ports.ts contains the ${label} inline. It must re-export, not reimplement.`);
}
// And the single source must still hold them.
for (const [label, re] of [
  ["vertical weight", /coverage \* 60/],
  ["off-baseline cap", /Math\.min\(10, substantive\.length \* 5\)/],
  ["boilerplate predicate", /search_term_string/],
  ["no-target rule", /if \(!c\.target\) return true;/],
]) {
  if (!re.test(source)) fails.push(`mcp-server agent-readiness-check.ts is missing the ${label}.`);
}

if (fails.length) {
  console.error("\n✗ check-scorer-drift: the agent-readiness scorer is no longer single-source.\n");
  for (const f of fails) console.error("  - " + f);
  console.error("\n  mcp-server/src/tools/agent-readiness-check.ts is the ONLY implementation.");
  console.error("  The published standard at /standards/agent-readiness documents its scoring,");
  console.error("  and @neverranked/mcp ships it. A second copy makes one of those a lie.\n");
  process.exit(1);
}
console.log("✓ check-scorer-drift: agent-readiness scoring is single-source.");

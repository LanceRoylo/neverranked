/**
 * scoring-ports.ts — single-source re-export of the two scoring tools.
 *
 * This file used to hold its own copy of agentReadinessCheck and
 * llmsTxtCheck, "ported verbatim" from mcp-server. Verbatim on the day it
 * was written, and drifting from then on: the 2026-08-24 recalibration had
 * to be applied to both by hand, and a boilerplate predicate was fixed twice
 * because it existed twice.
 *
 * That is the failure this repo keeps producing. orchestrate.mjs kept a
 * hand-maintained client-slug map that measurement_registry already held,
 * and prince_waikiki was missing from it. apply-bridge-to-d1.sh kept its own
 * copy of a delete the bridge had dropped. Here the cost is worse than
 * usual: two copies of a scoring rule means the same site can score
 * differently depending on which path a client hits -- one number in their
 * cross-map, another from the public tool they would check us with.
 *
 * mcp-server/src/tools/* is now the single source. Those modules are pure
 * (no imports, no node APIs, fetch and parsing only), so a Worker can bundle
 * them directly. The npm package still compiles from its own src/ and is
 * unaffected.
 *
 * Do not reintroduce an implementation here. scripts/check-scorer-drift.mjs
 * fails the build if this file grows one.
 */
export { agentReadinessCheck } from "../../../mcp-server/src/tools/agent-readiness-check";
export { llmsTxtCheck } from "../../../mcp-server/src/tools/llms-txt-check";

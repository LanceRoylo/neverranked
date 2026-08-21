import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { ENGINE_ORDER, ENGINE_KEYS } from "../src/lib/engine-order.ts";

// WHY. ENGINE_ORDER holds raw citation_runs.engine keys. The values that
// actually reach that column are string literals inside the daily runner's
// INSERT statements, so the two can disagree without anything failing: every
// consumer FILTERS by key, and a key that matches nothing renders as an
// absent engine rather than an error.
//
// That is not hypothetical. Both former copies of this list spelled Google AI
// Overviews `google_aio` while the runner inserts `google_ai_overview`. The
// readout grid and the cockpit citation map each silently dropped the engine,
// and HTC's delivered August 2026 report went out with six.
//
// This test reads the runner's source and asserts every display key is a key
// the writer can actually produce. It is deliberately source-level: the
// literals live in SQL strings, so there is nothing to import.

const RUNNER = readFileSync(new URL("../src/citations.ts", import.meta.url), "utf8");

/** Engine literals the runner inserts: `VALUES (?, 'engine', ...)`. */
function writerEngineKeys(src: string): Set<string> {
  const keys = new Set<string>();
  for (const m of src.matchAll(/INSERT INTO citation_runs[\s\S]{0,400}?VALUES\s*\(\s*\?\s*,\s*'([a-z0-9_]+)'/g)) {
    keys.add(m[1]);
  }
  // Some engines bind the key instead of inlining it; those appear as the
  // engine argument to maybeAlert, which takes the same value the INSERT used.
  for (const m of src.matchAll(/maybeAlert\(\s*env\s*,\s*[A-Za-z0-9_.]+\s*,\s*[A-Za-z0-9_.]+\s*,\s*"([a-z0-9_]+)"/g)) {
    keys.add(m[1]);
  }
  return keys;
}

test("the runner writes at least one engine key", () => {
  const written = writerEngineKeys(RUNNER);
  assert.ok(
    written.size >= 5,
    `Parsed only ${written.size} engine literals from citations.ts. The INSERT or maybeAlert shape probably changed; fix this parser rather than deleting the test, or it will pass while asserting nothing.`,
  );
});

test("every display engine key is one the runner actually writes", () => {
  const written = writerEngineKeys(RUNNER);
  const orphans = ENGINE_ORDER.filter((e) => !written.has(e.key));
  assert.deepStrictEqual(
    orphans.map((e) => e.key),
    [],
    `These keys appear in no citation_runs INSERT, so every chart filtering on them renders the engine as absent: ${orphans
      .map((e) => `${e.key} (${e.label})`)
      .join(", ")}. Writer keys: ${[...written].sort().join(", ")}.`,
  );
});

test("display keys are unique", () => {
  assert.strictEqual(ENGINE_KEYS.size, ENGINE_ORDER.length, "duplicate key in ENGINE_ORDER");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A FIGURE WITHOUT ITS DESCRIPTOR IS NOT A MEASUREMENT.
 *
 * Every customer-facing number in this system means nothing on its own. 18%
 * is a share of ANSWERS or a share of CITED SOURCES depending on the surface,
 * and the two are not comparable. Rank 3 is by attributed citations this month
 * or by entity mentions over 90 days. A grid cell at 100% rests on 13 checks
 * or on one.
 *
 * Each of those was a real defect on 2026-09-08, and each arrived the same
 * way: a narrower type. Atlas parsed engines_breakdown as
 * `{ citations, total, share_pct }` and the `layer` the writer stores simply
 * fell out, after which seven surfaces sorted into one ranked list and a share
 * of answers outranked every citation-grade surface in the customer chat.
 * Nothing failed. The field was just gone.
 *
 * This test pins the descriptors that exist so they cannot silently fall out
 * again. It reads source rather than types because the failure was a type
 * being rewritten in a narrower form, which typechecks perfectly.
 */

const read = (p: string) => readFileSync(p, "utf8");

test("Atlas carries the layer of every surface, and the note explaining it", () => {
  const src = read("src/lib/atlas-context.ts");
  // The field on each row.
  assert.match(src, /layer:\s*EngineLayer/, "by_engine rows must carry layer");
  // The prose the chat model actually reads.
  assert.match(src, /_layers:\s*LAYER_UNITS_NOTE/, "the layers note must reach the context");
  // And ordering must not re-imply comparability.
  // BOTH paths must group by layer: the snapshot path and the runs-based
  // fallback. Only one of them being fixed is how they disagreed before.
  assert.equal(
    (src.match(/\.sort\(byLayerThenShare\)/g) || []).length,
    2,
    "both the snapshot path and the runs fallback must group by layer",
  );
  // Scoped to the engine list. Sorting off-site source_types by share is fine:
  // those are all one kind of thing, with no layers to conflate.
  const engineSortLines = src.split("\n").filter((l) => l.includes("byEngineOut"));
  for (const l of engineSortLines) {
    assert.doesNotMatch(
      l,
      /b\.share_pct - a\.share_pct/,
      "a flat share ranking across layers is itself the false claim",
    );
  }
});

test("Atlas carries the basis of its rank, not a bare number", () => {
  const src = read("src/lib/atlas-context.ts");
  assert.match(src, /rank_basis:\s*CohortRankBasis/);
  assert.match(src, /_rank_basis_note/, "a fallback rank must say it is provisional");
});

test("the two share denominators stay separately named and described", () => {
  const src = read("src/lib/atlas-context.ts");
  // Renamed after Atlas answered "what is my citation share" from a different
  // denominator than the dashboard: 12% one place, 1.64% the other.
  assert.match(src, /venue_share_pct/);
  assert.match(src, /share_of_all_cited_sources_pct/);
  assert.match(src, /_units/, "both denominators must ship with their units");
});

test("the readout grid carries a layer per row", () => {
  const src = read("src/lib/report-facts.ts");
  assert.match(src, /layers:\s*EngineLayer\[\]/, "grid rows must declare their layer");
  assert.match(src, /layers:\s*engineRows\.map/, "and it must actually be populated");
});

test("the grid renderer uses a layer-appropriate verb", () => {
  const src = read("src/routes/customer-readouts.ts");
  // Model-knowledge tools cite nothing, so "cited you" is false about them
  // regardless of the number beside it.
  assert.match(src, /model_knowledge.*\?\s*"named you in"/s);
  assert.doesNotMatch(
    src,
    /const title = `\$\{esc\(eng\)\}[^`]*cited you on \$\{Math\.round/,
    "the tooltip must not hard-code 'cited' for every row",
  );
});

test("engine layer resolution has ONE source of truth", () => {
  // citations.ts held a private copy of the Layer 1 set while Atlas had none.
  // Two copies of this is how a surface ends up on the wrong side of the line.
  const citations = read("src/citations.ts");
  assert.match(citations, /import \{ LAYER1_ENGINE_KEYS \} from "\.\/lib\/engine-layer"/);
  assert.doesNotMatch(
    citations,
    /const LAYER1_ENGINES = new Set\(\[/,
    "the Layer 1 set must not be re-declared here",
  );
});

test("cohort rank has ONE implementation", () => {
  // Three call sites ranked the customer and one was correct. The other two
  // used sorted.indexOf(mine) + 1, which promotes a tie to the top of its group.
  for (const f of ["src/lib/atlas-context.ts", "src/lib/memo-inputs.ts"]) {
    const src = read(f);
    assert.match(src, /cohortRank\(/, `${f} must use the shared rank helper`);
    assert.doesNotMatch(src, /\.indexOf\([a-zA-Z]*[Cc]ited\)\s*\+\s*1/, `${f} still ranks by indexOf`);
    assert.doesNotMatch(src, /\.indexOf\(customerMentionCount\)/, `${f} still ranks by indexOf`);
  }
});

test("the grid encodes evidence as size, leaving intensity to mean share", () => {
  const src = read("src/routes/customer-readouts.ts");
  // Share already owns opacity. If confidence borrowed it too, neither would
  // be readable.
  assert.match(src, /const thin = markThin && n > 0 && n < THIN_CHECKS/);
  assert.match(src, /const inset = thin \? Math\.round\(CELL \* 0\.28\) : 0/);
  assert.doesNotMatch(src, /thin \? .*opacity/i, "confidence must not reuse the share channel");
  // And the threshold must be able to decline: a uniformly thin grid is not
  // misleading, so nothing is marked.
  assert.match(src, /const markThin = typicalDepth > THIN_CHECKS/);
});

test("the readout grid carries the check count behind every share", () => {
  const facts = read("src/lib/report-facts.ts");
  assert.match(facts, /counts: number\[\]\[\]/, "grid must expose per-cell depth");
  assert.match(facts, /const counts = engineRows\.map/, "and populate it");
  const view = read("src/routes/customer-readouts.ts");
  assert.match(view, /\$\{checks\} this month for question/, "the tooltip must name the sample size");
});

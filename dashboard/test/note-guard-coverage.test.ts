import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A GUARD FOUR OF FIVE NOTES RECEIVE IS HOW THIS KEEPS HAPPENING.
 *
 * report-notes.ts had a `verbOk` helper and a comment directly above the call
 * sites reading: "verbOk above is applied to EVERY note, not just the engines
 * one: the methodology's absolute is about the whole deliverable."
 *
 * It was not applied to every note. `questions` was assigned straight from
 * cleanNote and skipped the chain entirely, so it could attribute a citation
 * verb to a model-knowledge engine, address the reader in the third person,
 * or claim causation, and ship. It is the note most exposed to exactly that,
 * because its prompt asks it to quote a question and name the tool it moved
 * on.
 *
 * Same shape as the control channel pooled into the AI source list, and as
 * the causal guard that lived in atlas-grader but not in the readout: a rule
 * written down in one place and not applied to its neighbour.
 *
 * This test does not check that the guard is correct. It checks that no note
 * can be produced without passing through it, which is the property that kept
 * being lost.
 */

const FILE = readFileSync(new URL("../src/lib/report-notes.ts", import.meta.url), "utf8");

/**
 * Scope to the note-assembly function. Searching the whole file matches
 * unrelated locals in the guard helpers themselves (engineNoteClaimsOk opens
 * with `const engines = facts.engines || []`), which is a false positive that
 * would make this test lie in the reassuring direction.
 */
const start = FILE.indexOf("export async function writeAnalystNotes");
assert.ok(start > 0, "writeAnalystNotes not found in report-notes.ts");
const SRC = FILE.slice(start);

/** The five notes the readout renders, as named in the JSON contract. */
const NOTES = ["engines", "venue", "sources", "topSources", "questions"];

test("every note is routed through the shared guard chain", () => {
  for (const name of NOTES) {
    const assigned = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*([\\s\\S]{0,200}?);`, "m");
    const m = assigned.exec(SRC);
    assert.ok(m, `no assignment found for the "${name}" note`);
    assert.match(
      m![1],
      /guardNote\(/,
      `the "${name}" note is built without guardNote. Every note must pass ` +
        `through the one chain; that is the invariant this test exists to hold.`,
    );
  }
});

test("the guard chain still runs all four checks", () => {
  // If a check is deleted the chain silently weakens, which looks exactly
  // like nothing being wrong.
  const chain = /const guardNote =[\s\S]*?\n    };/.exec(SRC);
  assert.ok(chain, "guardNote helper not found");
  for (const call of ["engineVerbClaimsOk(", "notePersonOk(", "firstCausalClaim(", "checkHumanTone("]) {
    assert.ok(
      chain![0].includes(call),
      `guardNote no longer calls ${call} -- a guard was dropped from the chain`,
    );
  }
});

test("raw model output never reaches a note without cleanNote first", () => {
  // cleanNote enforces the numeric guardrail. A note assembled from raw.*
  // without it would carry invented figures into a paid deliverable.
  for (const name of NOTES) {
    const direct = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*raw\\.`, "m");
    assert.equal(
      direct.test(SRC),
      false,
      `the "${name}" note is assigned from raw model output without cleanNote`,
    );
  }
});

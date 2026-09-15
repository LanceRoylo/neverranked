import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* 'done' is not the only terminal roadmap status.
 *
 * On 2026-09-15 a retired client's 56 open roadmap items were set to
 * 'cancelled' rather than 'done', because marking them done would assert work
 * nobody performed. Two queries were updated to understand the new status. Two
 * more were missed, and an audit found them the same day:
 *
 *   roadmap-reconciler.ts  could flip a cancelled item to 'done' — the exact
 *                          false claim the status existed to prevent.
 *   routes/domain.ts       counted cancelled work as still outstanding in a
 *                          score projection shown to a customer.
 *
 * That is this codebase's signature failure: a rule written in one place and
 * not applied to its neighbour. This test is the neighbour check. It fails if
 * any query treats 'done' as the sole terminal state. */

const SRC = "src";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** A SQL or JS comparison that singles out 'done' without admitting
 *  'cancelled'. Allowlisting forms (status IN / status = 'x') are fine: they
 *  name what they want rather than what they exclude. */
// Only ITEM STATE. A bare `status !== "done"` on a form field is input
// validation, not a terminal-state test: roadmap.ts restricts a client to
// submitting 'done' and must keep rejecting 'cancelled' too.
const NEGATIVE_DONE = [
  /status\s*!=\s*'done'/,        // SQL, always about stored state
  /status\s*<>\s*'done'/,        // SQL
  /item\.status\s*!==\s*"done"/, // JS, explicitly an item
  /i\.status\s*!==\s*"done"/,    // JS, the filter idiom
];

test("no query treats 'done' as the only terminal roadmap status", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("roadmap_items")) continue;
    for (const line of src.split("\n")) {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
      if (line.includes("cancelled")) continue;
      for (const re of NEGATIVE_DONE) {
        if (re.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "These exclude 'done' but not 'cancelled', so cancelled work reads as outstanding " +
      "or can be resurrected as complete:\n" + offenders.join("\n"),
  );
});

test("the two paths found by the audit understand cancelled", () => {
  // Pinned individually so a refactor that drops the clause fails loudly rather
  // than passing because the regex above stopped matching a reworded line.
  const rec = readFileSync(join(SRC, "roadmap-reconciler.ts"), "utf8");
  assert.match(rec, /status NOT IN \('done', 'cancelled'\)[\s\S]{0,120}category IN/);

  const dom = readFileSync(join(SRC, "routes", "domain.ts"), "utf8");
  assert.match(dom, /i\.status !== "done" && i\.status !== "cancelled"/);
});

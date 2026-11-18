/* 2026-11-17: a refused memo draft must say WHY.
 *
 * The 2026-11-15 preview refused one client's draft. The cron alert and the
 * admin page both printed only "taxonomy/identity gate refused the draft":
 * the violations were computed and returned, then dropped by both callers.
 * describeMemoFailure is the one place that turns a result into that line. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { describeMemoFailure } from "../src/lib/memo-generator";

test("a taxonomy refusal names every violation", () => {
  const line = describeMemoFailure({
    error: "taxonomy/identity gate refused the draft",
    taxonomyViolations: ["names Copilot", "says the control is \"not an AI tool\""],
  });
  assert.equal(line, "taxonomy/identity gate refused the draft: names Copilot | says the control is \"not an AI tool\"");
});

test("a refusal with no listed reasons is unchanged", () => {
  assert.equal(describeMemoFailure({ error: "no measurement runs in the current window" }), "no measurement runs in the current window");
  assert.equal(describeMemoFailure({}), "unknown");
});

test("both callers print the reasons, not the bare error", () => {
  const cron = fs.readFileSync(new URL("../src/cron.ts", import.meta.url), "utf8");
  const admin = fs.readFileSync(new URL("../src/routes/admin-memos.ts", import.meta.url), "utf8");
  assert.match(cron, /could not be drafted: \$\{failed\.map\(\(f\) => `\$\{f\.slug\} \(\$\{describeMemoFailure\(f\)\}\)`\)/);
  assert.match(admin, /failed: \$\{esc\(describeMemoFailure\(r\)\)\}/);
  assert.doesNotMatch(cron, /\$\{f\.slug\} \(\$\{f\.error\}\)/);
});

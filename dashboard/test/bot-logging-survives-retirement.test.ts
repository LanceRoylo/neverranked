/* Retiring the serve path must not retire the measurement.
 *
 * logBotHit used to sit BELOW the HOSTED_INJECTION_RETIRED early return. When
 * that constant landed on 2026-09-08 (commit d71a19a), bot analytics stopped
 * dead: bot_hits has its last row dated 2026-09-09, across every pattern, and
 * the dashboard's "AI bots crawling your site" view has been empty for three
 * weeks. Nobody noticed, because an instrument that stops recording looks
 * exactly like a quiet month.
 *
 * Killing the serve path was correct. Killing the only record of which AI
 * crawlers and agents reach a client's pages was collateral damage, and it is
 * the measurement that matters most as agents begin browsing on people's
 * behalf.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../src/routes/inject.ts", import.meta.url), "utf8");

test("bot logging runs before the retirement return, not after", () => {
  const logAt = SRC.indexOf("ctx.waitUntil(logBotHit(env, {");
  const retireAt = SRC.indexOf("if (HOSTED_INJECTION_RETIRED) {");
  assert.ok(logAt > 0, "bot logging must exist");
  assert.ok(retireAt > 0, "the retirement gate must still exist");
  assert.ok(
    logAt < retireAt,
    "logBotHit must run BEFORE the early return, or retiring the serve path silently retires the measurement",
  );
});

test("the serve path stays dead", () => {
  // Restoring the measurement must not restore injection. Both handlers keep
  // their gate and the constant stays true.
  assert.match(SRC, /const HOSTED_INJECTION_RETIRED = true;/);
  assert.equal((SRC.match(/if \(HOSTED_INJECTION_RETIRED\) \{/g) || []).length, 2,
    "both handleInjectScript and handleInjectJson stay gated");
  assert.match(SRC, /NeverRanked: not configured/);
});

test("logging is still opportunistic and cannot break the response", () => {
  // The legacy two-argument call signature has no request or ctx, and a
  // logging failure must never affect what the client's page receives.
  assert.match(SRC, /if \(request && ctx\) \{/);
  assert.match(SRC, /ctx\.waitUntil\(/, "logging stays off the hot path");
});

test("the reason it moved is written down where the next person will look", () => {
  assert.match(SRC, /ABOVE the retirement return ON PURPOSE/);
  assert.match(SRC, /2026-09-08/);
  assert.match(SRC, /measurement-only is untouched/);
});

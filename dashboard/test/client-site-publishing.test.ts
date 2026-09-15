import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_SITE_PUBLISHING_RETIRED } from "../src/content-pipeline";

/* NeverRanked measures. It does not deploy to, or touch, client sites.
 *
 * Hosted schema injection was retired 2026-07-24 behind a code constant. The
 * content pipeline's write path survived that retirement untouched and was
 * found on 2026-09-15 still able to auto-approve a draft and publish it into a
 * client's WordPress or Webflow, then count the citations the URL it published
 * earned and write the result back.
 *
 * It was dormant only because no CMS had been connected. Connecting one is a
 * form submission, so dormancy was never the safeguard anyone thought it was.
 *
 * These tests fail if the gate is removed or if a second, ungated write path
 * appears. The second case is the one that actually happened. */

// cwd-relative: `npm test` runs tsx from the dashboard directory.
const read = (p: string) => readFileSync(`src/${p}`, "utf8");

test("the gate is on", () => {
  assert.equal(CLIENT_SITE_PUBLISHING_RETIRED, true);
});

test("the automatic path checks the gate before anything else", () => {
  const src = read("content-pipeline.ts");
  const fn = src.slice(src.indexOf("async function maybeAutoPublish"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /if \(CLIENT_SITE_PUBLISHING_RETIRED\) return;/);
  // It must be the FIRST statement. A gate placed after a database read still
  // does the read, and a gate placed after the publish does nothing at all.
  const gateAt = body.indexOf("CLIENT_SITE_PUBLISHING_RETIRED");
  const publishAt = body.indexOf("publishDraft");
  assert.ok(gateAt > 0 && (publishAt === -1 || gateAt < publishAt));
});

test("the self-grading scan is gated too", () => {
  // Writing to a client site and then measuring whether our own writing earned
  // citations is the referee marking his own team's goals. Both halves stop.
  const src = read("content-pipeline.ts");
  const fn = src.slice(src.indexOf("export async function runContentOutcomeScan"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /if \(CLIENT_SITE_PUBLISHING_RETIRED\) return;/);
});

test("the manual button is gated, and imports the flag rather than re-declaring it", () => {
  // The automatic path outlived the 2026-07-24 retirement because the rule was
  // written in one file and not applied to its neighbour. A second copy of this
  // constant would recreate exactly that.
  const src = read("routes/drafts.ts");
  assert.match(src, /CLIENT_SITE_PUBLISHING_RETIRED/);
  assert.match(src, /await import\("\.\.\/content-pipeline"\)/);
  assert.doesNotMatch(src, /const CLIENT_SITE_PUBLISHING_RETIRED\s*=/);
});

test("no write path to a client site is left ungated", () => {
  // Enumerated rather than trusted: every call site of publishDraft must sit
  // behind the flag. A new one added later fails this test.
  for (const file of ["content-pipeline.ts", "routes/drafts.ts"]) {
    const src = read(file);
    if (!src.includes("publishDraft")) continue;
    assert.ok(
      src.includes("CLIENT_SITE_PUBLISHING_RETIRED"),
      `${file} calls publishDraft without referencing the retirement flag`,
    );
  }
});

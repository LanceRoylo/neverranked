/**
 * AEO Analyzer -- empty-read guard regression harness
 *
 * 2026-08-13: hosts serving an empty 200 to Workers egress IPs were
 * graded 0/100 F, and the outreach pipeline published that zero as a
 * fact about sites that render fine in a browser (53 pending drafts,
 * 255 already sent). reportReadNothing() is the refusal: a fetched
 * page with content can never score 0, so all-empty signals mean the
 * fetch failed and must not be scored.
 *
 * Run with:
 *   npx tsx packages/aeo-analyzer/src/__tests__/empty-read.test.ts
 *
 * Exits non-zero if any fixture fails. No framework dep -- plain TS,
 * same harness style as hierarchy.test.ts.
 */

declare const process: { exit(code: number): never };

import { buildReport, reportReadNothing } from "../index";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    console.error(`FAIL  ${name}`);
    failures++;
  }
}

// ── The bug: an empty body scores 0 and must be refused ──────────────
{
  const r = buildReport("https://www.regalfiercemedia.com/", "");
  check("empty body scores 0 (the trap exists)", r.aeo_score === 0);
  check("empty body is flagged as read-nothing", reportReadNothing(r) === true);
}

// A whitespace-only or tag-shell response (some bot walls send a bare
// html scaffold) is still an empty read.
{
  const r = buildReport("https://example.com/", "<html><head></head><body>   </body></html>");
  check("tag-shell body is flagged as read-nothing", reportReadNothing(r) === true);
}

// ── The other side: minimal REAL content must never be refused ───────
// A title alone proves the fetch worked. Refusing real pages would
// silently drop scannable prospects, which is the expensive mistake.
{
  const r = buildReport(
    "https://example.com/",
    "<html><head><title>Mallard Agency</title></head><body></body></html>",
  );
  check("a bare title is NOT read-nothing", reportReadNothing(r) === false);
}
{
  const r = buildReport(
    "https://example.com/",
    "<html><body><h1>Arizona Media Agency</h1></body></html>",
  );
  check("a bare h1 is NOT read-nothing", reportReadNothing(r) === false);
}
{
  const r = buildReport(
    "https://example.com/",
    `<html><body><script type="application/ld+json">{"@type":"Organization","name":"X"}</script></body></html>`,
  );
  check("bare JSON-LD is NOT read-nothing", reportReadNothing(r) === false);
}
{
  const r = buildReport(
    "https://example.com/",
    "<html><body><p>Plain visible text and nothing else on the page.</p></body></html>",
  );
  check("bare visible text is NOT read-nothing", reportReadNothing(r) === false);
}

if (failures > 0) {
  console.error(`\n${failures} fixture(s) failed.`);
  process.exit(1);
}
console.log("\nAll empty-read fixtures passed.");

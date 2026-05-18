/**
 * Tests for injected meta-description following in the analyzer.
 *
 * The inject snippet can now deliver a <meta name="description"> the
 * same way it delivers JSON-LD. The scanner must follow it so a
 * "Meta description: Missing" technical signal flips to present once
 * we've deployed one (the Hawaii Theatre case that motivated this).
 *
 * Coverage:
 *   - homepage targeted ["/"]: Missing -> present, exact content
 *   - non-targeted path: stays Missing (no sitewide bleed)
 *   - page that already has a description: snippet owns/replaces it
 *   - exactly one meta name=description tag after injection
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportFollowingSnippets } from "../../packages/aeo-analyzer/src/report.ts";

const APPROVED =
  "Hawaii Theatre Center, the Pride of the Pacific. A restored 1922 National Register landmark in downtown Honolulu presenting concerts, theatre, comedy, dance, film, film festivals, venue rentals, and theatre education.";

const SNIPPET = '<script src="https://app.neverranked.com/inject/hawaii-theatre.js"></script>';

function pageHtml(opts: { withDescription?: boolean } = {}): string {
  const existing = opts.withDescription
    ? '<meta name="description" content="old stale CMS description">'
    : "";
  return `<!doctype html><html><head><title>Hawaii Theatre Center</title>${existing}${SNIPPET}</head><body><h1>Hawaii Theatre</h1><p>${"word ".repeat(400)}</p></body></html>`;
}

function mockFetch(meta: { content: string; pages: string | string[] }[]): typeof fetch {
  return (async (input: unknown) => {
    const reqUrl = typeof input === "string" ? input : String(input);
    if (/\/inject\/hawaii-theatre\.json$/.test(reqUrl)) {
      return new Response(
        JSON.stringify({ client_slug: "hawaii-theatre", schemas: [], meta_descriptions: meta }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

const metaSignal = (r: { technical_signals: { label: string; value: string; status: string }[] }) =>
  r.technical_signals.find((s) => s.label === "Meta description")!;

test("homepage targeted [\"/\"]: Missing flips to the approved copy", async () => {
  const fetchFn = mockFetch([{ content: APPROVED, pages: ["/"] }]);
  const report = await buildReportFollowingSnippets(
    "https://www.hawaiitheatre.com/",
    pageHtml(),
    fetchFn,
  );
  assert.equal(report.signals.meta_desc, APPROVED);
  const sig = metaSignal(report);
  assert.notEqual(sig.value, "Missing");
  assert.notEqual(sig.status, "bad");
  assert.match(sig.value, /Hawaii Theatre Center, the Pride of the Pacific/);
});

test("non-targeted path stays Missing (no sitewide bleed)", async () => {
  const fetchFn = mockFetch([{ content: APPROVED, pages: ["/"] }]);
  const report = await buildReportFollowingSnippets(
    "https://www.hawaiitheatre.com/events",
    pageHtml(),
    fetchFn,
  );
  assert.equal(report.signals.meta_desc, null);
  assert.equal(metaSignal(report).value, "Missing");
});

test("snippet owns/replaces an existing CMS description, single tag", async () => {
  const fetchFn = mockFetch([{ content: APPROVED, pages: ["/"] }]);
  const report = await buildReportFollowingSnippets(
    "https://www.hawaiitheatre.com/",
    pageHtml({ withDescription: true }),
    fetchFn,
  );
  assert.equal(report.signals.meta_desc, APPROVED);
  assert.doesNotMatch(report.signals.meta_desc ?? "", /stale CMS/);
});

test("no em dash in the approved copy (NeverRanked voice rule)", () => {
  assert.doesNotMatch(APPROVED, /[—–]/);
});

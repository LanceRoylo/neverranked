/**
 * AEO Analyzer -- Report builder (composes all modules)
 *
 * Schema coverage now uses the shared hierarchy helper so subtypes count
 * as matching parent types. Also surfaces any schema types found on the
 * page that aren't in our hierarchy map -- this is our early warning for
 * blind spots so we know when to extend hierarchy.ts.
 */

import type { Report } from "./types";
import { extractMeta, findInjectSnippetUrls, fetchInjectedPayload, filterByUrl, injectIntoHtml, pickMetaForUrl, injectMetaIntoHtml } from "./extract";
import type { InjectedSchema, InjectedMeta } from "./extract";
import { generateRedFlags } from "./flags";
import { calculateAeoScore, calculateGrade } from "./score";
import { generateTechnicalSignals, CRITICAL_SCHEMAS } from "./signals";
import { hasSchemaType, getUnknownTypes } from "./hierarchy";

/**
 * Did the scanner actually READ anything?
 *
 * 2026-08-13: several prospect hosts serve an empty 200 to
 * Cloudflare-Workers egress IPs (bot protection, sometimes persistent,
 * sometimes intermittent). The analyzer scored those empty documents
 * 0/100 grade F, and the outreach pipeline wrote "your own site scores
 * 0/100" into 53 pending cold emails as fact about sites that render
 * fine in a browser. A fetched page with content can never score 0 — a
 * title alone earns points — so all-empty signals mean the fetch
 * failed, not that the site is empty.
 *
 * Callers that PUBLISH a score (the /api/check endpoint, and therefore
 * the outreach scans, the MCP tool, and the public /check page) must
 * refuse to score when this is true, the same way they refuse a 403.
 */
export function reportReadNothing(report: Report): boolean {
  const s = report.signals;
  return (
    s.word_count === 0 &&
    !s.title &&
    s.h1_count === 0 &&
    s.jsonld_block_count === 0
  );
}

export function buildReport(url: string, html: string): Report {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  const signals = extractMeta(html, url);
  const redFlags = generateRedFlags(signals);
  const aeoScore = calculateAeoScore(signals);
  const grade = calculateGrade(aeoScore);

  const schemaCoverage = CRITICAL_SCHEMAS.map((type) => ({
    type,
    present: hasSchemaType(signals.schema_types, type),
  }));

  const technicalSignals = generateTechnicalSignals(signals);

  // Early-warning log: surface any schema types we didn't recognize so we
  // know when schema.org has grown past our hierarchy map.
  const unknown = getUnknownTypes(signals.schema_types);
  if (unknown.length > 0) {
    console.log(`[analyzer] unknown schema types on ${domain}: ${unknown.join(", ")}`);
  }

  return {
    url,
    domain,
    signals,
    schema_coverage: schemaCoverage,
    red_flags: redFlags,
    grade,
    aeo_score: aeoScore,
    technical_signals: technicalSignals,
    client_side_rendered: signals.client_side_rendered,
  };
}

/**
 * Async variant of buildReport that follows NeverRanked inject
 * snippets, merges the schemas they would inject (filtered by
 * `pages` match against the scanned URL), and then runs the normal
 * report pipeline against the augmented HTML.
 *
 * This is what the dashboard scanner uses. Sync `buildReport` stays
 * available for the public schema-scorer at check.neverranked.com,
 * which doesn't need to follow snippets (the user pastes one URL
 * at a time and we want pure-HTML scoring there).
 */
export async function buildReportFollowingSnippets(
  url: string,
  html: string,
  fetchFn: typeof fetch = fetch,
): Promise<Report & { injected_schema_count?: number }> {
  const snippetBases = findInjectSnippetUrls(html);
  console.log(`[report] ${url}: found ${snippetBases.length} inject snippets: ${JSON.stringify(snippetBases)}`);
  const payloads = await Promise.all(
    snippetBases.map((b) => fetchInjectedPayload(b, fetchFn))
  );
  const allInjected: InjectedSchema[] = payloads.flatMap((p) => p.schemas);
  const allMetas: InjectedMeta[] = payloads.flatMap((p) => p.metas);
  const matched = filterByUrl(allInjected, url);
  const matchedMeta = pickMetaForUrl(allMetas, url);
  console.log(`[report] ${url}: ${allInjected.length} total injected, ${matched.length} matched this URL; meta ${matchedMeta ? "injected" : "none"}`);
  const augmented = injectMetaIntoHtml(injectIntoHtml(html, matched), matchedMeta);
  const report = buildReport(url, augmented);
  return { ...report, injected_schema_count: matched.length };
}

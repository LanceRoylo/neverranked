/**
 * Dashboard — Per-page discovery and schema scanning
 *
 * Discovers pages via sitemap.xml, scans each for schema types,
 * and stores results in page_scans for the coverage matrix.
 */

import type { Env } from "./types";
import { collectSchemaTypes } from "../../packages/aeo-analyzer/src/extract";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 NeverRanked-AEO-Monitor/1.0";
const MAX_PAGES = 15; // Cap per domain to stay within Worker CPU limits
const FETCH_TIMEOUT = 5_000;
const TOTAL_TIME_LIMIT = 20_000; // Stop scanning pages after 20s total

interface PageScan {
  id: number;
  domain_id: number;
  url: string;
  schema_types: string;
  aeo_score: number;
  grade: string;
  last_scanned_at: number;
}

/** Discover pages from sitemap.xml, falling back to homepage only */
export async function discoverPages(domain: string): Promise<string[]> {
  const pages: string[] = [];
  const base = `https://${domain}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const resp = await fetch(`${base}/sitemap.xml`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const xml = await resp.text();
      // Extract <loc> URLs from sitemap
      const locMatches = xml.match(/<loc>(.*?)<\/loc>/gi) || [];
      for (const loc of locMatches) {
        const url = loc.replace(/<\/?loc>/gi, "").trim();
        if (url.startsWith("http")) {
          pages.push(url);
        }
      }
    }
  } catch {
    // Sitemap not available
  }

  // Always include homepage
  if (!pages.some(p => {
    try {
      const u = new URL(p);
      return u.pathname === "/" || u.pathname === "";
    } catch { return false; }
  })) {
    pages.unshift(`${base}/`);
  }

  // Cap to MAX_PAGES
  return pages.slice(0, MAX_PAGES);
}

/** Extract schema types from a single page's HTML */
function extractSchemaTypes(html: string): string[] {
  const jsonldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const types: string[] = [];
  for (const block of jsonldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      collectSchemaTypes(data, types);
    } catch {
      // Skip invalid JSON-LD
    }
  }
  // Deduplicate
  return [...new Set(types)];
}

/** Quick score for a single page (simplified, not full AEO score) */
function quickPageScore(html: string, schemaTypes: string[]): { score: number; grade: string } {
  let score = 0;

  // Has title (10)
  if (/<title[^>]*>.+<\/title>/i.test(html)) score += 10;

  // Has meta description (10)
  if (/name=["']description["']/i.test(html)) score += 10;

  // Has H1 (10)
  if (/<h1[\s>]/i.test(html)) score += 10;

  // Has canonical (10)
  if (/rel=["']canonical["']/i.test(html)) score += 10;

  // Has OG tags (10)
  if (/property=["']og:title["']/i.test(html)) score += 5;
  if (/property=["']og:description["']/i.test(html)) score += 5;

  // Schema types present (up to 30)
  score += Math.min(schemaTypes.length * 10, 30);

  // Word count > 300 (10)
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const words = (text.match(/\b\w+\b/g) || []).length;
  if (words > 300) score += 10;

  // Has lang attribute (5)
  if (/<html[^>]+lang=/i.test(html)) score += 5;

  // Cap at 100
  score = Math.min(score, 100);

  const grade = score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";
  return { score, grade };
}

/** Scan all discovered pages for a domain and store results */
export async function scanDomainPages(
  domainId: number,
  domain: string,
  env: Env
): Promise<number> {
  const startTime = Date.now();
  const urls = await discoverPages(domain);
  const now = Math.floor(Date.now() / 1000);
  let scanned = 0;

  // Ensure monitored_pages entries exist
  for (const url of urls) {
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO monitored_pages (domain_id, url, active, created_at) VALUES (?, ?, 1, ?)"
      ).bind(domainId, url, now).run();
    } catch {
      // Unique constraint or other issue
    }
  }

  // Scan each page (with total time guard)
  for (const url of urls) {
    if (Date.now() - startTime > TOTAL_TIME_LIMIT) {
      console.log(`Page scanning for ${domain}: stopped after ${scanned} pages (time limit)`);
      break;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;

      const html = await resp.text();
      const schemaTypes = extractSchemaTypes(html);
      const { score, grade } = quickPageScore(html, schemaTypes);

      // Upsert page_scans
      await env.DB.prepare(
        `INSERT INTO page_scans (domain_id, url, schema_types, aeo_score, grade, last_scanned_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(domain_id, url) DO UPDATE SET
           schema_types = excluded.schema_types,
           aeo_score = excluded.aeo_score,
           grade = excluded.grade,
           last_scanned_at = excluded.last_scanned_at`
      ).bind(domainId, url, JSON.stringify(schemaTypes), score, grade, now).run();

      scanned++;
    } catch {
      // Timeout or network error, skip page
    }

    // Small delay between page fetches
    await new Promise(r => setTimeout(r, 200));
  }

  return scanned;
}

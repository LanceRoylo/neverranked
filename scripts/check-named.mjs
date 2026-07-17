#!/usr/bin/env node
/**
 * check-named.mjs — no indexed page may name a real non-customer business
 * from a measured cohort.
 *
 * BRIGHT LINE #1, mechanized. The containment doc lists it first:
 * "Naming any non-customer competitor on a publicly-indexed page." It was on
 * the honor system until now, and the honor system lost.
 *
 * WHAT HAPPENED (2026-07-17)
 * --------------------------
 * Every -aeo landing page was noindex until 2026-07-16, when the marketing
 * pages were flipped to index,follow. That flip did not audit them, so
 * /hawaii-bank-aeo/ went from invisible to crawlable while naming Bank of
 * Hawaii, First Hawaiian, American Savings Bank, Central Pacific, Hawaii
 * National and Territorial Savings — six real banks, none of them customers,
 * one of them (ASB) an active pitch target whose compliance team could read it.
 *
 * It got worse in combination. The page asserted the cohort was "named in full
 * in the banking teardown". Teardown 01 actually says "Subject brand and cohort
 * anonymized" and names no bank. So the page published a ROSTER for a teardown
 * that reports per-bank figures as "Bank A / Bank B" — collapsing the anonymity
 * set from 23 to a named handful. Anonymized data plus a published roster is
 * not anonymized. Same shape as naming the island for the "most-cited boutique
 * on Maui".
 *
 * The false "named in full" claim had propagated to /faq/, /results/,
 * /teardowns/ and the cross-category source comment. Four pages describing a
 * policy the practice does not follow.
 *
 * THE RULE THIS ENFORCES
 * ----------------------
 * Cohort businesses are anonymized on every public surface, without exception.
 * Public infrastructure is nameable, because it is not a business being
 * measured against its competitors: OTAs, portals, review platforms, insurance
 * carriers and provider directories (HMSA, Delta Dental) are the sources AI
 * cites, not members of the cohort. Teardown 03 states this outright —
 * "Insurance carriers were deliberately excluded" — which is exactly why they
 * may be named.
 *
 * Named in full is permitted in exactly two places, neither public:
 *   1. Inside a paid engagement (it is the customer's own data)
 *   2. A private 1:1 artifact (/pitch/*, /first-look/*), which check-noindex
 *      guarantees stays noindex
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/**
 * Real, non-customer businesses that appear in a measured cohort. Naming any
 * of these on an indexed page is bright line #1.
 */
const COHORT_BUSINESSES = [
  "Bank of Hawaii", "First Hawaiian", "American Savings Bank",
  "Central Pacific Bank", "Hawaii National Bank", "Territorial Savings",
  "Hamada Financial", "Halekulani", "Royal Hawaiian", "Moana Surfrider",
];

/**
 * Pages allowed to name a cohort business, with the reason.
 * Keep this list near-empty. Each entry is a place bright line #1 does not
 * reach, and every one needs a reason that survives being read aloud.
 */
const ALLOW = [
  {
    // "no equivalent of Bank of Hawaii in dental" — a rhetorical comparison
    // about category consolidation, not a claim about the bank. Verified
    // 2026-07-17.
    page: "teardowns/dental-honolulu/index.html",
    names: ["Bank of Hawaii"],
    why: "rhetorical comparison about category consolidation, no claim about the named bank",
  },
];

const strip = (s) =>
  s.replace(/<style[\s\S]*?<\/style>/gi, " ")
   .replace(/<script[\s\S]*?<\/script>/gi, " ")
   .replace(/<!--[\s\S]*?-->/g, " ")
   .replace(/<[^>]+>/g, " ")
   .replace(/&[a-z]+;/gi, " ")
   .replace(/\s+/g, " ");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error("check-named: dist/ not found — run scripts/build.sh first.");
  process.exit(1);
}

const violations = [];
let scanned = 0;

for (const f of files) {
  const rel = relative(DIST, f);
  const html = readFileSync(f, "utf8");
  // Private pages are out of scope: bright line #1 is about PUBLICLY-INDEXED
  // pages, and check-noindex.mjs separately guarantees they stay private.
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) continue;
  scanned++;
  const text = strip(html);
  const allowed = ALLOW.find((a) => a.page === rel);
  for (const name of COHORT_BUSINESSES) {
    if (!new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) continue;
    if (allowed && allowed.names.includes(name)) continue;
    const at = text.search(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    violations.push({
      page: rel,
      name,
      quote: text.slice(Math.max(0, at - 70), at + name.length + 70).trim(),
    });
  }
}

if (violations.length) {
  console.error(`\n✗ check-named: ${violations.length} cohort business(es) named on an INDEXED page:\n`);
  for (const v of violations) {
    console.error(`  /${v.page.replace(/index\.html$/, "")}`);
    console.error(`      names: ${v.name}`);
    console.error(`      ...${v.quote}...\n`);
  }
  console.error("  Bright line #1: naming a non-customer competitor on a publicly-indexed");
  console.error("  page. Cohort businesses are anonymized on every public surface, without");
  console.error("  exception. Named in full is permitted only inside a paid engagement or a");
  console.error("  private 1:1 artifact (/pitch/*, /first-look/*), never here.\n");
  process.exit(1);
}

console.log(`✓ check-named: no cohort business named on any of ${scanned} indexed page(s).`);

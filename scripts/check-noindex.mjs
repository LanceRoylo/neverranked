#!/usr/bin/env node
/**
 * check-noindex.mjs — private pages must never become indexable.
 *
 * WHY
 * ---
 * Until 2026-07-16 every page on this site carried noindex,nofollow. That was
 * a containment leftover: when NeverRanked published named receipt pages, the
 * bright line was "no public named pages", so noindex went on everything. The
 * receipts are long gone. The tag stayed.
 *
 * The result was absurd for this company specifically. robots.txt says "AI
 * crawlers are explicitly welcome" and then every page told them not to index
 * it. Two of the seven surfaces we measure (Google AI Overviews, and Copilot
 * via Bing) are built on indexes that obey noindex, so the practice that
 * measures whether AI cites a business was instructing those engines not to
 * cite it. Worse, it was backwards internally: the teardowns and /claims/ were
 * indexed while the homepage they sell was invisible, and nofollow meant the
 * homepage passed nothing to them anyway.
 *
 * Flipping the public marketing pages to index,follow creates the opposite and
 * far worse risk, which is what this file exists for: a PRIVATE page leaking
 * into a search index. /pitch/* are 1:1 leave-behinds naming real prospects and
 * their competitors. /first-look/prince-waikiki/ is a paying customer's
 * unpublished diagnostic. Those name real businesses and, per the anonymize-
 * non-customers rule, may only exist as private 1:1 artifacts. One of them in
 * Google is a customer-relationship incident, not a bug.
 *
 * So the direction of enforcement is asymmetric on purpose. Public pages
 * getting indexed is a marketing choice. Private pages getting indexed is a
 * breach. This blocks the second and ignores the first.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/**
 * Path prefixes that must ALWAYS be noindex. Adding a directory here is
 * cheap; forgetting to is the expensive direction, so when in doubt, add it.
 */
const MUST_BE_PRIVATE = [
  { prefix: "pitch/", why: "1:1 prospect leave-behinds. They name a real prospect and, being private artifacts, name competitors too. Never indexable." },
  { prefix: "first-look/", why: "a named customer's unpublished diagnostic (Prince Waikiki). Never indexable." },
  { prefix: "thanks/", why: "a post-conversion endpoint with no search value." },
  { prefix: "schemas/", why: "retirement tombstones for the disavowed schema thesis. They must resolve, never rank." },
  { prefix: "standards/", why: "retirement tombstones for the disavowed thesis. They must resolve, never rank." },
  { prefix: "admin/", why: "internal." },
];

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
  console.error("check-noindex: dist/ not found — run scripts/build.sh first.");
  process.exit(1);
}

const leaks = [];
let privateOk = 0;
let publicIndexable = 0;

for (const f of files) {
  const rel = relative(DIST, f);
  const rule = MUST_BE_PRIVATE.find((r) => rel.startsWith(r.prefix));
  const html = readFileSync(f, "utf8");
  // Only a robots meta with noindex counts. An absent tag means indexable:
  // the default is index,follow, so silence is consent here.
  const isNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);

  if (rule) {
    if (isNoindex) privateOk++;
    else leaks.push({ page: rel, why: rule.why });
  } else if (!isNoindex) {
    publicIndexable++;
  }
}

if (leaks.length) {
  console.error(`\n✗ check-noindex: ${leaks.length} PRIVATE page(s) are indexable:\n`);
  for (const l of leaks) {
    console.error(`  /${l.page.replace(/index\.html$/, "")}`);
    console.error(`      ${l.why}`);
    console.error(`      Fix: restore <meta name="robots" content="noindex, nofollow"> on this page.\n`);
  }
  console.error("  A private 1:1 page in a search index names a real business that never");
  console.error("  agreed to be named publicly. That is a relationship incident, not a bug.\n");
  process.exit(1);
}

console.log(`✓ check-noindex: ${privateOk} private page(s) correctly hidden, ${publicIndexable} public page(s) indexable.`);

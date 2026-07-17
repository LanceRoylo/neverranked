#!/usr/bin/env node
/**
 * check-figures.mjs — every figure on a vertical page must trace to a
 * teardown that page links to.
 *
 * WHY
 * ---
 * The vertical pages (/for-hospitality/, /for-real-estate/) restate figures
 * that live in the teardowns. They were transcribed by hand. Nothing checked
 * them, and two failure modes follow from that:
 *
 *  1. TRANSCRIPTION. A mistyped figure on a page whose entire product is
 *     measurement accuracy is not a typo, it is the same class of failure as
 *     the retraction. (Caught on 2026-07-16: /for-hospitality/ printed a
 *     "7 independent, 6 chain" cohort split that exists ONLY in an HTML
 *     comment in the teardown source, never in the published page. True, but
 *     unverifiable by a reader clicking through — which is the same thing as
 *     unsourced on this site.)
 *  2. DRIFT. teardown-drift.mjs watches whether a teardown's numbers still
 *     match current tooling. Nothing watched whether a MARKETING page still
 *     matches its teardown. Re-run teardown 11, have 17% become 19%, and the
 *     hospitality page silently becomes false while every existing check
 *     stays green.
 *
 * The rule this enforces is the site's own: every published number is dated
 * and tied to the run that produced it. If a reader cannot click the cited
 * teardown and find the figure, we should not print the figure.
 *
 * Generic by design: it reads which teardowns a page links to and checks
 * against those. Adding a vertical page requires no change here.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const NAMED = { amp: "&", nbsp: " ", middot: ".", rarr: "", times: "x", copy: "(c)", mdash: "—", ndash: "-", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "..." };
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
   .replace(/&([a-zA-Z]+);/g, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));

const toText = (html) =>
  decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      // Comments are stripped deliberately: a figure that lives only in a
      // source comment is NOT published and cannot substantiate a page.
      // That distinction is exactly what this check exists to enforce.
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ");

// Figures that are ours to assert and need no teardown behind them:
// engagement pricing, the reseller arithmetic derived from it on
// /for-agencies/ ($500/mo spread x 12 = $6,000/yr, x 3 categories =
// $18,000/yr), the GET rate, and calendar years.
const OWN_FIGURES = new Set(["4,500", "1,500", "2,000", "4.712", "500", "6,000", "18,000"]);
const isYear = (n) => /^(19|20)\d\d$/.test(n.replace(/,/g, ""));

// Figures a page COMPUTES from published source figures rather than quoting.
// Allowed only when the page shows its working, so a reader can check the
// arithmetic against the teardown themselves. Keyed "<page-slug>:<figure>".
// Keep this list short. Every entry is a number a reader cannot find by
// searching the teardown, which is exactly the thing this check exists to
// prevent — so each one has to earn its place.
const DERIVED = new Map([
  [
    "for-hospitality:9",
    "the citation wall's third block: teardown 11's remaining source types summed (review directories 4 + social 2 + Reddit 2 + YouTube 1 + Wikipedia 0 = 9). Needed because the wall is 100 blocks and must total 100. The page states the components and the sum.",
  ],
]);

const pages = readdirSync(DIST)
  .filter((d) => d.startsWith("for-") && existsSync(join(DIST, d, "index.html")))
  .map((d) => ({ slug: d, file: join(DIST, d, "index.html") }));

if (!pages.length) {
  console.log("✓ check-figures: no vertical pages to check.");
  process.exit(0);
}

const problems = [];
let checked = 0;

for (const { slug, file } of pages) {
  const html = readFileSync(file, "utf8");
  const text = toText(html);

  // Which teardowns does this page cite? Those are its permitted sources.
  const linked = [...new Set([...html.matchAll(/href="\/teardowns\/([a-z0-9-]+)\//g)].map((m) => m[1]))];
  const sources = linked
    .map((s) => join(DIST, "teardowns", s, "index.html"))
    .filter(existsSync)
    .map((p) => toText(readFileSync(p, "utf8")));

  if (!sources.length) {
    // A vertical page with figures but no cited teardown is unsourced by
    // construction.
    const hasFigures = /\b\d[\d,]{2,}\b/.test(text) || /\d{1,3}\s*(?:%|percent)/.test(text);
    if (hasFigures) problems.push({ slug, kind: "no-source", detail: "page prints figures but links no teardown" });
    continue;
  }
  const inSource = (needle) => sources.some((s) => s.includes(needle));

  // 1. Distinctive multi-digit figures (counts, totals, cohort sizes).
  for (const n of new Set(text.match(/\b\d[\d,]{2,}\b/g) || [])) {
    if (OWN_FIGURES.has(n) || isYear(n)) continue;
    checked++;
    if (!inSource(n)) problems.push({ slug, kind: "figure", detail: `"${n}" appears on the page but in none of its cited teardowns (${linked.join(", ")})` });
  }

  // 2. Percentage claims — the headline numbers.
  for (const m of text.matchAll(/(\d{1,3})\s*(?:%|\bpercent\b)/g)) {
    const pct = m[1];
    if (DERIVED.has(`${slug}:${pct}`)) continue;
    checked++;
    if (!inSource(`${pct}%`) && !inSource(`${pct} percent`)) {
      const at = m.index || 0;
      problems.push({ slug, kind: "percent", detail: `"${pct}%" not found in ${linked.join(", ")} — context: ...${text.slice(Math.max(0, at - 60), at + 40).trim()}...` });
    }
  }
}

if (problems.length) {
  console.error(`\n✗ check-figures: ${problems.length} figure(s) on vertical pages do not trace to a cited teardown:\n`);
  for (const p of problems) {
    console.error(`  /${p.slug}/`);
    console.error(`      ${p.detail}\n`);
  }
  console.error("  Either the figure is wrong, or the teardown changed under it, or the page");
  console.error("  cites something the teardown never published. All three must be fixed here,");
  console.error("  not waived: an unverifiable number is unsourced, whatever its provenance.\n");
  process.exit(1);
}

console.log(`✓ check-figures: every figure on ${pages.length} vertical page(s) traces to a cited teardown (${checked} figures checked).`);

#!/usr/bin/env node
/**
 * check-claims.mjs — BLOCKING build gate for strict-liability claims.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-07-16 a sweep found the publicly retracted Hawaii Theatre figures
 * ("45 to 95", "14 of 19") live on FIVE pages: the homepage (twice),
 * /for-agencies/, /faq/, /pitch/hulas/, and the Prince Waikiki first-look
 * page that a customer's counsel was reading at the time. Our own
 * /retraction/ page asserts "The site no longer contradicts the retraction."
 * It had stopped being true weeks earlier and nothing noticed.
 *
 * A grader existed the whole time and would have caught it. It was wired to
 * the cold-email path and never to the website. The site had no gate at all,
 * so the single most dangerous claim we own could walk onto the homepage and
 * sit there.
 *
 * This runs on every build, costs nothing, calls no API, and cannot be
 * primed or hallucinate. It is the free half of the grader
 * (neverranked-outreach/lib/output-grader.js :: detectDeterministic) applied
 * to shipped HTML.
 *
 * SCOPE: strict liability ONLY — claims that are false, retracted, or
 * retired. Deliberately NOT style. Voice rules (em dashes, AI-tell words)
 * would fire across dozens of legacy pages and train everyone to ignore the
 * output, and an ignored gate is how a real finding gets waved through.
 * Style belongs in the LLM grader, run deliberately on new copy.
 *
 * KEEP IN SYNC with RETRACTED_CLAIM_PATTERNS in
 * ../neverranked-outreach/lib/output-grader.js. Separate repos, so this is a
 * deliberate duplicate rather than an import. If a retracted claim is ever
 * added or lifted, both lists change together.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// ── Rules ──────────────────────────────────────────────────────────────
// Every pattern here is a claim we may never publish, in any framing.
// Hedging does not rescue a retracted number: "we used to say 45 to 95"
// still puts the digits on the page where they can be lifted and reused.

// severity: "block" fails the build. "warn" reports without failing, for
// rules whose underlying fact is still being settled. A gate that blocks on
// an unanswered question just teaches people to bypass the gate.
const RULES = [
  // scanSource: also scan HTML COMMENTS, not just rendered text.
  //
  // Only the retracted-figure rules get this, and the reason is specific to
  // this company. Comments are invisible to a human reader, which is why the
  // other rules ignore them (an author note explaining a rule is not a
  // published claim). But AI crawlers parse HTML comments, and NeverRanked's
  // entire product is what AI reads about a business. Feeding a retracted
  // number about ourselves into the corpus from our own source would be a
  // uniquely stupid way to resurrect it.
  //
  // Caught exactly that on 2026-07-16, minutes after deploy: the warning
  // comment on the homepage, written to stop anyone reintroducing "45-to-95",
  // contained the digits. The rendered page was clean; the shipped bytes were
  // not. View-source is also trivial for a journalist or a competitor.
  {
    id: "retracted-htc-score",
    severity: "block",
    scanSource: true,
    re: /\b45\s*(?:->|→|to)\s*95\b|\b45-to-95\b/i,
    why: 'the retracted Hawaii Theatre 45-to-95 score lift (retracted at /retraction/). Applies to HTML comments too: AI crawlers read them',
  },
  {
    id: "retracted-htc-perplexity",
    severity: "block",
    scanSource: true,
    re: /\b5\s*(?:->|→)\s*14\b|\b14\s*(?:of|\/)\s*19\b/i,
    why: 'the retracted Hawaii Theatre 14-of-19 Perplexity citation claim (retracted at /retraction/). Applies to HTML comments too: AI crawlers read them',
  },
  {
    id: "false-never-touched",
    severity: "block",
    re: /\bnever\s+touched\s+their\s+site\b/i,
    why: 'false: the snippet WAS deployed on the HTC site, which is what /retraction/ disavows',
  },
  {
    id: "retired-sku",
    severity: "block",
    // "$2,000/mo" was deliberately NOT included. It was a retired tier price,
    // but /for-agencies/ legitimately quotes $2,000/mo as the AGENCY's resale
    // price in its margin calculator ("your cost $1,500, you charge $2,000").
    // A pattern that cannot tell our retired price from a reseller's markup
    // produces a false positive on correct copy, and false positives are how
    // a gate gets ignored. $497/mo and "$750 audit" are unambiguous: they
    // were only ever our SKUs.
    re: /\$497\s*\/\s*mo|\$750\s+audit|\baudit\s+credit\b/i,
    why: "a retired SKU from the pre-retraction product line",
  },
  {
    id: "retired-product",
    severity: "block",
    re: /\bschema\s+auto-?deploy|\bdone-for-you\b/i,
    why: "a retired product presented as active (we measure only, we never execute)",
  },
  {
    // The free hand-built 1-page diagnostic (5 real questions, one per
    // business) was retired 2026-07-19 and replaced by the paid $950 pilot.
    // The free INSTANT check (check.neverranked.com) is the only no-cost item
    // and is deliberately NOT matched. Bare "diagnostic" is legitimate and not
    // matched either (e.g. "the measurement and diagnostic layer" on
    // /for-agencies/) — only the retired-offer phrasings are.
    id: "retired-free-diagnostic",
    severity: "block",
    re: /\bfree\s+(?:1-page\s+|one-page\s+|hand-built\s+)?diagnostic\b|\bhand-built\s+(?:1-page\s+|one-page\s+)?diagnostic\b|\b(?:1-page|one-page)\s+diagnostic\b|\bfive\s+real\s+(?:buyer\s+|customer\s+)?questions\b|Free%20diagnostic/i,
    why: "the free hand-built 1-page diagnostic, retired 2026-07-19 and replaced by the $950 pilot; the free instant check is the only no-cost item",
  },
  {
    id: "cadence-overclaim",
    // BLOCKING as of 2026-07-16, once the underlying question was actually
    // answered by reading the code rather than guessing: capture genuinely IS
    // daily. dashboard/src/cron.ts :: runDailyTasks dispatches one
    // CitationKeywordWorkflow per client per keyword every day at 06:00 UTC.
    //
    // So the old rule was simply wrong. It banned the word outright and
    // therefore flagged TRUE technical description on nine pages, /methodology/
    // included, where the cadence is the literal subject. It stayed at "warn"
    // for exactly that reason. A gate that fires on accurate copy teaches
    // everyone to wave it through, and a waved-through gate catches nothing.
    //
    // The line now sits where it belongs: the retired overclaim is selling
    // "daily" as the PRODUCT (daily monitoring, daily reports, tracked daily
    // in your dashboard), because the deliverable is the monthly memo. One
    // reading is weather. The month is climate. Describing the capture cadence
    // technically is accurate and allowed, so /vs/ ("Daily measurement happens
    // in the background") and /methodology/ ("every query once per engine per
    // day") now pass, correctly, without a word being changed.
    //
    // KEEP IN SYNC with CADENCE_PATTERNS in
    // ../neverranked-outreach/lib/output-grader.js. Edit one, edit both: these
    // two drifted within hours last time, which is how this gate reported 1
    // page when 9 carried the phrase.
    // NARROW ON PURPOSE, and the narrowing was earned. A broader version of
    // this rule fired twice on correct copy the first time it ran blocking:
    //   - /takedowns/ "The contact above is monitored daily" — that is the
    //     takedown INBOX, backing the 24-hour response promise. Not
    //     measurement at all.
    //   - /methodology/ "Automated daily drift alerts." — that sits in a
    //     not-yet-built section DISCLOSING what we do not have.
    // Both would have been blocked by a monitor|track + daily proximity rule.
    // "Daily" is a word whose meaning is entirely context, which makes it a
    // poor fit for a string matcher, so this only matches phrasings that
    // cannot mean anything except selling it. Framing calls go to the LLM
    // axis and to human review, where judgment belongs.
    severity: "block",
    re: /\b(?:daily|every\s+day)\s+monitoring\b|\b(?:you\s+(?:get|receive)|we\s+(?:give|send|deliver|hand)\s+you)\b[^.\n]{0,40}\b(?:daily|every\s+day)\b/i,
    why: 'sells "daily" as the product. Capture IS daily and may be described technically, but the deliverable is the monthly memo — one reading is weather, the month is climate',
  },
];

// ── Allowlist ──────────────────────────────────────────────────────────
// /retraction/ is the accounting itself. It cannot explain what was
// retracted without naming it, so it is the ONE place the figures may
// appear. That is the whole design: a single source means the numbers can
// never be lifted out of a correction elsewhere and reused as proof.
// /terms/ is allowlisted on the same principle: it names the retired SKUs in
// order to VOID them ("References to that product, to monthly tiers named
// Pulse, Signal, or Amplify, to the '$750 audit' ... are no longer in
// effect"). A disclaimer has to name what it disclaims.
const ALLOW = [
  { path: "retraction/index.html", rules: ["retracted-htc-score", "retracted-htc-perplexity"] },
  { path: "terms/index.html", rules: ["retired-sku", "retired-product"] },
];

function allowed(relPath, ruleId) {
  return ALLOW.some((a) => relPath === a.path && a.rules.includes(ruleId));
}

// ── HTML to text ───────────────────────────────────────────────────────
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: ".",
  rarr: "", larr: "", mdash: "—", ndash: "-", times: "x", copy: "(c)",
  hellip: "...", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
};
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
   .replace(/&([a-zA-Z]+);/g, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));

function toText(html) {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // HTML comments are stripped: an author note explaining a rule is not a
    // published claim, and comments are where we keep the warnings that stop
    // this from regressing.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(stripped).replace(/\s+/g, " ").trim();
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

// ── Run ────────────────────────────────────────────────────────────────
let files;
try {
  files = walk(DIST);
} catch {
  console.error("check-claims: dist/ not found — run scripts/build.sh first.");
  process.exit(1);
}

const hits = [];
for (const f of files) {
  const rel = relative(DIST, f);
  const html = readFileSync(f, "utf8");
  const text = toText(html);
  // Comments, extracted separately so scanSource rules can see what a crawler
  // sees. Pulled out explicitly rather than by loosening toText, because a
  // comment can contain ">" and would shred a naive tag-strip.
  const comments = decode((html.match(/<!--[\s\S]*?-->/g) || []).join(" ")).replace(/\s+/g, " ");

  for (const rule of RULES) {
    if (allowed(rel, rule.id)) continue;
    const haystack = rule.scanSource ? `${text} ${comments}` : text;
    const m = haystack.match(rule.re);
    if (!m) continue;
    const at = haystack.indexOf(m[0]);
    const inComment = at >= text.length;
    hits.push({
      page: rel,
      rule: rule.id,
      severity: rule.severity,
      why: rule.why + (inComment ? " — found in an HTML COMMENT: invisible to a reader, visible to a crawler and to view-source" : ""),
      quote: haystack.slice(Math.max(0, at - 55), at + m[0].length + 55).trim(),
    });
  }
}

const show = (h) => {
  console.error(`  /${h.page.replace(/index\.html$/, "")}`);
  console.error(`      rule: ${h.rule} — ${h.why}`);
  console.error(`      ...${h.quote}...\n`);
};

const blocking = hits.filter((h) => h.severity === "block");
const warnings = hits.filter((h) => h.severity === "warn");

if (warnings.length) {
  console.error(`\n⚠ check-claims: ${warnings.length} advisory claim warning(s) (not blocking):\n`);
  warnings.forEach(show);
}

if (blocking.length) {
  console.error(`✗ check-claims: ${blocking.length} strict-liability claim(s) on shipped pages:\n`);
  blocking.forEach(show);
  console.error("  These may not ship. Remove the claim, or if the page names it in order to");
  console.error("  retract or void it, add the page to the ALLOW list in scripts/check-claims.mjs.\n");
  process.exit(1);
}

console.log(`✓ check-claims: no retracted or retired claims on any shipped page (${files.length} pages scanned${warnings.length ? `, ${warnings.length} advisory warning(s) above` : ""}).`);

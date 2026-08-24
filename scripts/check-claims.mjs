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

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
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
    // THE RETIRED ENGAGEMENT CARD. Superseded 2026-08-03 by the two-tier
    // ladder. Found still live on 2026-08-18 in the check tool: its FAQ
    // JSON-LD, its on-page price cards, and BOTH of its post-scan emails,
    // which had been mailing "$4,500 kickoff + $1,500/mo" to every person
    // who ran a free scan for six weeks after the price changed. The site
    // was clean because check-claims only ever walked dist/; the check
    // tool is a separate Worker and nothing looked at it.
    //
    // Matches the two figures only when they are PRICED (a dollar sign, or
    // a /mo suffix), so pages that record the old card as dated history
    // still read naturally while any attempt to SELL it is blocked.
    id: "retired-engagement-card",
    severity: "block",
    re: /\$4,500|\$1,500\s*(?:<[^>]*>)?\s*\/\s*mo|\$1,500\s*(?:a|per)\s+month|kickoff\s*\+\s*\$1,500/i,
    why: "the $4,500 kickoff / $1,500 per month card, retired 2026-08-03 and replaced by the two-tier ladder (Monitor $199, Audit $750 after a $950 baseline)",
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

  // ── Bing channel reclassification, 2026-08-22 ────────────────────────
  //
  // The channel labeled "Microsoft Copilot" is Bing organic top-5 via
  // DataForSEO: keyword search, not an answer engine. It returned the pop
  // song "Stay" for "where to stay in Waikiki", and about half its
  // denominator across categories was dictionaries and bestbuy.com matching
  // the word "best". Copilot's real citations (an ai_overview item on the
  // same endpoint) are not retrievable for this account -- 14 live probes,
  // zero hits.
  //
  // The DATA stays, as a classic-search control. These claims do not.
  {
    // Six AI tools now: four citation-grade + two model-knowledge, with
    // Bing classic search as a control that is NOT an AI tool.
    id: "retired-seven-tools",
    severity: "block",
    // "surfaces" is deliberately absent: seven channels genuinely WERE
    // queried in the historical runs, and saying so is true. What is false
    // is calling all seven AI tools, since one is a classic-search control.
    re: /\b(?:seven|7)\s+AI\s+(?:tools?|engines?|surfaces?)\b|\b(?:seven|7)\s+(?:tools?|engines?)\b/i,
    why: 'claims seven AI tools. Retired 2026-08-22: six AI tools (four citation-grade that search the live web, two model-knowledge), plus Bing classic search as a control',
  },
  {
    id: "retired-five-citation-grade",
    severity: "block",
    // Literal alternation, no variable-length gaps: a {0,N} over a
    // near-anything class backtracks catastrophically on HTML-stripped
    // pages (this hung the checker on first write).
    re: /five citation-grade|five that search the live web|five engines that search/i,
    why: 'claims five citation-grade engines. Retired 2026-08-22: it is four (Perplexity, ChatGPT search, Gemini grounded, Google AI Overviews)',
  },
  {
    // The observation "Bing's organic results name no firm in this cohort"
    // is still TRUE and still publishable. Only the Copilot name, and the
    // inference below, are retired.
    id: "retired-copilot-as-tool",
    severity: "block",
    re: /\bMicrosoft Copilot\b|\bCopilot\s*\(Bing\)/i,
    why: 'names Microsoft Copilot as a measured AI tool. Retired 2026-08-22: that channel is Bing organic, published as "Bing search (control)"',
  },
  {
    // "Rank first on Bing organic and you own the Copilot answer" is a
    // CAUSAL claim about an engine we do not measure, resting on the proxy
    // this reclassification disproved. Same shape as 45-to-95: a real
    // observation with an unmeasured causal story attached. Retired while
    // the company had one paying client, which is the cheapest it gets.
    id: "retired-copilot-first-mover",
    severity: "block",
    re: /owns? the Copilot answer|first-?mover/i,
    why: 'the Copilot first-mover claim. Retired 2026-08-22: it asserts that ranking on Bing organic causes Copilot citation, which we never measured, on a channel that is not Copilot',
  },
  {
    // Bare-name Copilot ATTRIBUTION. retired-copilot-as-tool catches the
    // full product name; the 2026-08-22 audit found ~30 sentences
    // asserting Copilot BEHAVIOR from our data under the bare name
    // ("Copilot cites...", "the Copilot gap", "cited zero times by
    // Copilot", "Bing/Copilot own-share", "excluding Copilot"). We have
    // no Copilot data, so any behavioral attribution is unpublishable.
    id: "retired-copilot-attribution",
    severity: "block",
    re: /\bCopilot(?:'|’)?s?\s+(?:cites?|cited|answers?|answered|pulls?|pulled|surfaces?|surfaced|tends?|tracks?|recognizes?|does\s+not\s+recognize|has\s+nothing)\b|\bthe\s+Copilot\s+(?:gap|opening|answer|result|row|pattern|read|lever)\b|\b(?:cited|surfaced|named)\s+(?:zero\s+times\s+)?by\s+Copilot\b|\bon\s+Copilot\b|\bBing\/Copilot\b|\bexcluding\s+Copilot\b/i,
    why: 'attributes measured behavior to Copilot under the bare name. We have no Copilot data; the channel is Bing organic, published as "Bing search (control)"',
  },
  {
    // Warn, not block, on purpose: /methodology/'s pooled-figure passage
    // legitimately describes the five-surface pool with the control shown
    // separately, and a gate that blocks the one page that words it
    // correctly teaches everyone to bypass the gate.
    id: "control-counted-as-engine",
    severity: "warn",
    re: /five web-searching|five live-web|five surfaces that search|five engines that search the live web/i,
    why: 'counts the Bing control as a web-searching AI engine. It is four AI engines plus a control; if the five-surface pooled figure is the subject, label the pool explicitly',
  },
  {
    // The banking cohort was NEVER named in full. This exact claim was found
    // false and corrected 2026-07-17 (see the head comment in
    // teardowns/cross-category/index.html), then reappeared and was corrected
    // again 2026-08-22. Anonymity claims are load-bearing: teardown 01
    // publishes per-bank figures under Bank A/B labels, so a "named in full"
    // assertion plus any roster collapses the anonymity set.
    //
    // Anchored to the COHORT IDENTIFIER (a count or the category) rather than
    // the bare word "cohort". A dry run of the broader /cohort (?:is )?named
    // in full/ form matched three legitimate uses -- the paid-engagement
    // promise on hawaii-bank-aeo:175, the 1:1 deliverable note on the Hawaii
    // Theatre pitch, and this file's own correction record. Allowlisting
    // hawaii-bank-aeo would have blinded the gate on the public page most
    // likely to regress this claim, so the pattern excludes those by shape
    // instead. "named in full inside paid engagements" never matched.
    id: "false-cohort-named-in-full",
    severity: "block",
    re: /(?:\d+-(?:bank|domain|firm|venue)|banking|consumer banking) cohort (?:is )?named in full/i,
    why: 'claims a cohort is named in full. Every non-customer cohort is anonymized (teardown 01: "Subject brand and cohort anonymized"); this exact claim was corrected 2026-07-17 and regressed once already',
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
  // "first-mover" in its ordinary commercial sense, unrelated to the retired
  // Copilot claim: vertical-exclusivity terms offered to the first agency to
  // sign, and a market-window observation about agent readiness. Declared
  // rather than exempted by a narrower pattern, so a new use has to be
  // deliberate.
  { path: "content/meeting-evidence/mvnp-2026-05-18.html", rules: ["retired-copilot-first-mover"] },
  { path: "reports/state-of-agent-readiness/state-of-agent-readiness-2026-05.html", rules: ["retired-copilot-first-mover"] },
  // A3 brings content/ into scope. This file's "all 7 engines (the six
  // commercial APIs plus Gemma)" is the CORRECT dated historical form the
  // 2026-08-22 handoff says to preserve. Allowlisted rather than weakening
  // the rule or editing a dated artifact.
  { path: "content/meeting-evidence/asb-2026-05-18.html", rules: ["retired-seven-tools"] },
  // Dated, delivered artefacts. A3 brought these into scope. Each names a
  // then-current SKU or engine classification as a record of what was actually
  // delivered on that date. Editing them would falsify a delivered document,
  // so they are declared here rather than rewritten or pattern-narrowed.
  // retracted-htc-* is allowlisted here on the /retraction/ principle: the file
  // now carries a banner naming both retracted figures in order to void them,
  // and a disclaimer has to name what it disclaims.
  { path: "audits/asb-hawaii-2026-05/audit.html", rules: ["retired-sku", "retracted-htc-perplexity", "retracted-htc-score"] },
  { path: "audits/bank-of-hawaii/audit.html", rules: ["retired-sku"] },
  { path: "audits/central-pacific-bank/audit.html", rules: ["retired-sku"] },
  { path: "audits/drake-real-estate-partners/audit.html", rules: ["retired-sku"] },
  { path: "audits/emanate-wireless-inc/audit.html", rules: ["retired-sku"] },
  { path: "audits/first-hawaiian-bank/audit.html", rules: ["retired-sku"] },
  { path: "audits/mvnp-agency/audit.html", rules: ["retired-sku"] },
  { path: "audits/ward-village/audit.html", rules: ["retired-sku"] },
  { path: "content/audits/iq360-muckrack-comparison.html", rules: ["retired-sku", "retired-engagement-card"] },
  { path: "content/meeting-evidence/asb-2026-05-18.html", rules: ["retired-copilot-as-tool"] },
  { path: "content/meeting-evidence/mvnp-2026-05-18.html", rules: ["retired-engagement-card"] },
  // The head comment here quotes the false claim in order to record that it
  // was found false and corrected. A correction has to name what it corrects.
  { path: "teardowns/cross-category/index.html", rules: ["false-cohort-named-in-full"] },
  // The preview output-grader names every retired phrase precisely so it
  // can refuse drafts containing them. Same principle as /retraction/ and
  // /terms/: a detector has to name what it detects.
  { path: "dashboard/src/preview/output-grader.ts", rules: ["retired-seven-tools", "retired-copilot-as-tool", "retired-five-citation-grade", "retired-sku", "retired-engagement-card", "retired-copilot-attribution", "cadence-overclaim", "retracted-htc-score", "retracted-htc-perplexity", "false-never-touched", "retired-free-diagnostic", "retired-product"] },
  // The generator PROMPT lists retracted claims in order to forbid the
  // model from writing them. Its own product and pricing statements were
  // corrected 2026-08-24; what remains are prohibitions.
  { path: "dashboard/src/preview/generator.ts", rules: ["retracted-htc-score", "retracted-htc-perplexity", "false-never-touched", "retired-free-diagnostic"] },
  // The checkout catalog lists dead SKUs explicitly prefixed "(RETIRED)"
  // so an old price id can never be silently re-sold. Naming them is the
  // point. cron.ts is a Stripe refund description for a real past charge.
  { path: "dashboard/src/routes/checkout.ts", rules: ["retired-sku", "retired-engagement-card", "retired-product", "retired-seven-tools"] },
  { path: "dashboard/src/cron.ts", rules: ["retired-sku", "retired-engagement-card"] },
  // audit-delivery throws on entry ("generateAndStoreAudit disabled") and
  // has since 2026-05-20. Its dead Pulse/Signal pricing cannot reach
  // anyone. Rewriting copy inside a disabled generator would only make
  // it look shippable. Delete this entry when the module is rewritten.
  { path: "dashboard/src/audit-delivery.ts", rules: ["retired-sku", "retired-engagement-card", "retired-product"] },
  // Guard message naming the retired SKU as the reason the drip is off.
  { path: "dashboard/src/nurture-drip.ts", rules: ["retired-sku"] },
  { path: "terms/index.html", rules: ["retired-sku", "retired-product"] },
];

// ── App-sweep debt, declared not hidden ────────────────────────────────
// Bringing dashboard/src into scope on 2026-08-24 surfaced 35 files still
// carrying pre-reclassification claims: "Microsoft Copilot" as a measured
// tool, retired SKUs, seven-engine counts. The marketing site was swept on
// 2026-08-22; the product clients log into never was.
//
// Fixing 35 files in one pass, eight days before a paying kickoff, is how
// you introduce a worse bug than the one you set out to fix. So this is a
// RATCHET, not an amnesty: every file below is a known debt that reports as
// a warning, and any app file NOT on this list fails the build outright. The
// list may only ever shrink. Delete a path the moment its file is clean.
//
// Prince-critical surfaces are deliberately absent -- they were fixed on
// 2026-08-24 rather than declared: the cockpit, the Atlas system prompt, and
// the engine display maps that render raw keys to clients.
// The client-app claims sweep COMPLETED 2026-08-24. This list held 31 files
// carrying pre-reclassification claims while they were worked through; it is
// now empty, so any retired claim reaching dashboard/src fails the build the
// day it is written. The mechanism stays because the ratchet is the point:
// debt may be declared, but only ever downward.
const APP_SWEEP_PENDING = new Set([]);

function appSweepPending(relPath) {
  return APP_SWEEP_PENDING.has(relPath);
}

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
    else if (e.endsWith(".html") || e.endsWith(".ts")) out.push(p);
  }
  return out;
}

// Strip // and /* */ comments before matching TypeScript. Comments never reach
// a client -- only string literals render -- and scanning them would flag the
// very notes that explain a retirement (this file's own rule comments name
// every retired claim on purpose). Quote-aware so a "//" inside a URL string
// is not mistaken for a comment.
function stripTsComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; out += " "; continue; }
    out += c; i++;
  }
  return out;
}

// Surfaces that ship to real people but are NOT built into dist/. The check
// tool is a Cloudflare Worker whose source carries the whole page plus two
// post-scan emails as template literals, so a retired price in here reaches
// an inbox without ever touching a page this script used to scan. That gap
// is how the retired card kept selling for six weeks after 2026-08-03.
const EXTRA_SOURCES = [join(ROOT, "tools", "schema-check", "src", "index.ts")];

// Shipped surfaces NOT built into dist/: delivered client audits, outbound
// comparison docs, meeting-evidence packets, report HTML, and the rendered
// social/LinkedIn graphic sources. These reach real people as files or
// rendered images without passing through dist/, which is how "Microsoft
// Copilot" survived the 2026-08-22 sweep in three of them: the gate never
// read them. (The regexes were fine -- toText collapses the line-broken
// form before matching. Coverage was the gap.)
const EXTRA_DIRS = ["audits", "content", "reports", "linkedin", "social"]
  .map((d) => join(ROOT, d));

// The dashboard app: the product every CLIENT logs into. It was never in
// scope, so the 2026-08-22 sweep cleaned the marketing site while the cockpit
// kept serving retired Copilot claims to customers -- including a Bing-lever
// causal claim that would have rendered on Prince Waikiki's first login
// (found 2026-08-24, one week before his kickoff). Nothing here is built into
// dist/; it renders at request time from TypeScript template literals.
const APP_DIRS = [join(ROOT, "dashboard", "src")];

// Captured third-party pages (competitor HTML saved as evidence during an
// audit) are not our copy and must not be graded as our claims. Scanning
// them made the gate report a competitor's pricing as our retired SKU.
const isThirdPartyCapture = (f) => f.includes(`${sep}raw${sep}`);

// ── Run ────────────────────────────────────────────────────────────────
let files;
try {
  files = walk(DIST);
} catch {
  console.error("check-claims: dist/ not found — run scripts/build.sh first.");
  process.exit(1);
}
for (const extra of EXTRA_SOURCES) {
  if (existsSync(extra)) files.push(extra);
  else console.warn(`check-claims: expected source not found, skipping ${extra}`);
}

for (const dir of APP_DIRS) {
  if (existsSync(dir)) walk(dir, files);
  else console.warn(`check-claims: expected app dir not found, skipping ${dir}`);
}

for (const dir of EXTRA_DIRS) {
  if (existsSync(dir)) {
    const found = [];
    walk(dir, found);
    files.push(...found.filter((f) => !isThirdPartyCapture(f)));
  } else {
    console.warn(`check-claims: expected source dir not found, skipping ${dir}`);
  }
}

const hits = [];
for (const f of files) {
  const rel = f.startsWith(DIST) ? relative(DIST, f) : relative(ROOT, f);
  const raw = readFileSync(f, "utf8");
  const html = f.endsWith(".ts") ? stripTsComments(raw) : raw;
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
    // Declared app debt reports as a warning; anything NOT declared blocks.
    // That is the ratchet: the list can only shrink, and a NEW retired claim
    // in the client-facing app fails the build the day it is written.
    const declaredDebt = appSweepPending(rel);
    hits.push({
      page: rel,
      rule: rule.id,
      severity: declaredDebt ? "warn" : rule.severity,
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

const pendingCount = hits.filter((h) => appSweepPending(h.page)).length;
if (pendingCount) {
  console.error(
    `\n⚠ check-claims: ${pendingCount} finding(s) in ${APP_SWEEP_PENDING.size} declared app files ` +
    `awaiting the client-app claims sweep. Declared, not hidden -- shrink APP_SWEEP_PENDING as files are cleaned.\n`
  );
}

if (blocking.length) {
  console.error(`✗ check-claims: ${blocking.length} strict-liability claim(s) on shipped pages:\n`);
  blocking.forEach(show);
  console.error("  These may not ship. Remove the claim, or if the page names it in order to");
  console.error("  retract or void it, add the page to the ALLOW list in scripts/check-claims.mjs.\n");
  process.exit(1);
}

console.log(`✓ check-claims: no retracted or retired claims on any shipped page (${files.length} pages scanned${warnings.length ? `, ${warnings.length} advisory warning(s) above` : ""}).`);

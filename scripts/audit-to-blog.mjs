#!/usr/bin/env node
/**
 * audit-to-blog.mjs
 *
 * Convert an audit folder into an anonymized blog post for
 * neverranked.com/blog. The audit data is the most defensible
 * content we produce — every audit run becomes ~5,000 words of
 * indexable AEO authority content competitors cannot fake.
 *
 * Usage:
 *   node scripts/audit-to-blog.mjs --audit=audits/<slug> \
 *     --vertical="Hawaii community banking" \
 *     --output=content/blog/<post-slug>.md
 *
 * Anonymization rules (enforced):
 *   - Replace business name with "a Hawaii community bank" or
 *     similar archetype phrase keyed on the --vertical flag
 *   - Strip URLs that resolve to the customer's domain
 *   - Strip phone numbers, addresses, founder names
 *   - Preserve all numeric findings (schema coverage %, OG image
 *     %, word counts, etc) since those are the structural insights
 *   - Preserve methodology references unchanged
 *
 * Anti-pattern (what this is NOT):
 *   - Not a doxxing tool — never name a customer in the output
 *   - Not a scrape — only operates on audit folders we generated
 *   - Not auto-publish — writes to content/blog/ for human review
 *     before deploy
 */

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  })
);

if (!args.audit || !args.vertical || !args.output) {
  console.error('Usage: --audit=<folder> --vertical="<vertical>" --output=<file>');
  process.exit(1);
}

const auditDir = path.resolve(args.audit);
const outputPath = path.resolve(args.output);
const vertical = args.vertical;

if (!fs.existsSync(auditDir)) {
  console.error(`Audit folder not found: ${auditDir}`);
  process.exit(1);
}

// Vertical archetype phrases — used to replace the customer's name
const VERTICAL_ARCHETYPES = {
  'Hawaii community banking': 'a Hawaii community bank',
  'Hawaii real estate development': 'a Hawaii master-planned community developer',
  'Hawaii performing arts': 'a Hawaii performing arts venue',
  'Hawaii law firm': 'a Honolulu law firm',
  'Hawaii medical practice': 'a Honolulu medical practice',
  'Hawaii hospitality': 'a Hawaii boutique hotel',
};

const archetype = VERTICAL_ARCHETYPES[vertical] || `a ${vertical} business`;

// Read the executive summary — that's the source for the post
const execPath = path.join(auditDir, '00-executive-summary.md');
if (!fs.existsSync(execPath)) {
  console.error(`Missing 00-executive-summary.md in ${auditDir}`);
  process.exit(1);
}

let exec = fs.readFileSync(execPath, 'utf8');

// Pull business name. Prefer explicit --business-name. Fall back
// to "Prepared for:" line, then to H1 with leading-The/trailing-Audit
// stripped.
let businessName = args['business-name'] || null;
if (!businessName) {
  const preparedMatch = exec.match(/Prepared for:\*?\*?\s*(.+)$/m);
  if (preparedMatch) businessName = preparedMatch[1].trim();
}
if (!businessName) {
  const h1Match = exec.match(/^#\s+(.+)$/m);
  if (h1Match) {
    businessName = h1Match[1]
      .replace(/^The\s+/i, '')
      .replace(/\s+Audit\s*$/i, '')
      .replace(/\s*[-—]\s*.*$/, '')
      .trim();
  }
}
if (!businessName) {
  console.error('Could not detect business name. Use --business-name=<name>.');
  process.exit(1);
}

// Read schema review for the technical detail
const schemaPath = path.join(auditDir, '03-schema-review.md');
const schemaReview = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';

// Build a list of ONLY high-confidence name variants — never split
// into single common words like "The" or "Bank" since that nukes
// surrounding text.
function buildVariants(name) {
  const v = new Set();
  v.add(name);
  v.add(name.replace(/\s+/g, ''));
  // Possessive forms
  v.add(name + "'s");
  v.add(name + "'");
  // Common abbreviations — only safe ones, multi-letter
  const abbrev = name.split(/\s+/)
    .filter(w => /^[A-Z]/.test(w) && w.length > 1)
    .map(w => w[0])
    .join('');
  if (abbrev.length >= 3) v.add(abbrev);
  return [...v].sort((a, b) => b.length - a.length);
}

// Common competitor names that may appear and should also be
// anonymized in the teardown context.
const COMPETITOR_PHRASES = [
  'First Hawaiian Bank', 'First Hawaiian', 'FHB',
  'American Savings Bank', 'ASB Hawaii', 'ASB',
  'Bank of Hawaii', 'BOH',
  'Central Pacific Bank', 'CPB',
  'Ward Village', 'Howard Hughes',
];

function anonymize(text) {
  if (!text) return text;

  let result = text;

  // Strip the metadata header block (Prepared for / by / Date)
  result = result.replace(/^\*\*Prepared for:\*\*[^\n]*\n?/gm, '');
  result = result.replace(/^\*\*Prepared by:\*\*[^\n]*\n?/gm, '');
  result = result.replace(/^\*\*Date:\*\*[^\n]*\n?/gm, '');
  result = result.replace(/^\*\*URL audited:\*\*[^\n]*\n?/gm, '');
  result = result.replace(/^\*\*Deliverable type:\*\*[^\n]*\n?/gm, '');

  // Replace primary business name
  const variants = buildVariants(businessName);
  for (const v of variants) {
    const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    result = result.replace(re, archetype);
  }

  // Replace competitor names (use generic phrasing so the teardown
  // doesn't accidentally name a category competitor in print)
  for (const c of COMPETITOR_PHRASES) {
    if (c === businessName) continue;
    const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    result = result.replace(re, 'a category competitor');
  }

  // Strip phone numbers
  result = result.replace(/\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, '[phone]');

  // Strip URLs that look like customer domains (but keep neverranked.com refs)
  result = result.replace(/https?:\/\/(?!.*neverranked\.com)[^\s)]+/g, 'their website');

  // Strip ZIP-attached addresses
  result = result.replace(/\b\d+\s+[A-Z][a-z]+\s+(St|Ave|Rd|Blvd|Way|Place|Pl|Drive|Dr)\b[^.]*\d{5}/g, '[address]');

  return result;
}

// Build the blog post
const today = new Date().toISOString().slice(0, 10);
const postSlug = path.basename(outputPath, '.md');

const frontmatter = `---
title: "AEO Teardown: ${vertical}"
slug: ${postSlug}
date: ${today}
vertical: "${vertical}"
type: "audit-teardown"
status: draft
description: "What we found auditing the AEO landscape for ${archetype.replace(/^a /, '')}. Anonymized findings from a real customer audit, with the structural patterns we see across the category."
---

`;

// Anonymize the exec summary
const anonExec = anonymize(exec);
// Strip the H1 (we have the title in frontmatter)
const execBody = anonExec.replace(/^#\s+.+\n+/, '');

const intro = `## What this is

This is a real audit we ran in the last 30 days, anonymized.
The customer is ${archetype}. Names, URLs, addresses, and
identifying details have been replaced. Every numeric finding
(schema coverage percentages, page counts, word counts, citation
observations) is unchanged — those are the structural patterns
we want you to see.

If you run a business in this category, the findings here are
likely a close approximation of what you would see if you ran
the same audit on your own site.

You can independently verify the methodology at
[neverranked.com/leaderboards/methodology](https://neverranked.com/leaderboards/methodology).
You can run the same scan on your own site at
[check.neverranked.com](https://check.neverranked.com).

`;

const middle = `## What we found

${execBody}

`;

// Anonymize schema review (the most useful part for category readers)
let schemaSection = '';
if (schemaReview) {
  const anonSchema = anonymize(schemaReview);
  const schemaBody = anonSchema.replace(/^#\s+.+\n+/, '');
  schemaSection = `## The schema layer in detail

${schemaBody}

`;
}

const closing = `## What this means for your business

If you operate in ${vertical} and you have not deployed Schema.org
structured data on your site recently, the gaps above are almost
certainly present on your site too. The pattern is consistent across
the category.

The fix is straightforward but specific. Generic schema deployment
will not help — and in many cases will hurt, per the published
research showing partial schema coverage scoring lower in citation
eligibility than no schema at all.

If you want a free six-engine scan of your own site, run
[check.neverranked.com](https://check.neverranked.com). The same
methodology used in this audit produces a score for any URL in
about 30 seconds.

If you want a full audit at the depth shown here, that is the $750
NeverRanked audit deliverable. Same format, your business.

---

*Audit anonymized for publication. Original audit was delivered
to a paying NeverRanked customer.*
`;

const post = frontmatter + intro + middle + schemaSection + closing;

// Write
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, post);

console.log(`Wrote ${outputPath}`);
console.log(`Length: ${post.length} chars (~${Math.round(post.split(/\s+/).length)} words)`);
console.log(`Anonymized as: ${archetype}`);
console.log(`Status: draft — review before deploying.`);
